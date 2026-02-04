from fastapi import APIRouter, Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List

from database import get_db
from models import Question, Vote, Room
from schemas import QuestionCreate, QuestionResponse, VoteCreate
from security import get_room_by_code, check_room_expiration
import utils

from connection_manager import manager

router = APIRouter(prefix="/api/rooms/{room_code}/questions", tags=["questions"])

@router.get("/", response_model=List[QuestionResponse])
async def list_questions(
    sort: str = "custom", # 'top' or 'latest'
    room: Room = Depends(get_room_by_code),
    db: AsyncSession = Depends(get_db)
):
    # check_room_expiration(room) # List is allowed for expired rooms? Maybe read-only.
    # User feedback says "Block access to expired rooms" but usually read-only is fine.
    # PRD says "Prevents old rooms from clutter", implies closing.
    # For consistency with "Block access", we can check expiration.
    # But usually organizers want to see history.
    # Let's enforce it for interactions (Ask, Vote) but maybe View is okay?
    # User said "Add expires_at check in: List questions". STRICT then.
    check_room_expiration(room)

    query = select(Question).where(Question.room_id == room.id)

    if sort == "top":
        query = query.order_by(desc(Question.votes), desc(Question.created_at))
    else: # latest
        query = query.order_by(desc(Question.created_at))

    result = await db.execute(query)
    return result.scalars().all()

@router.post("/", response_model=QuestionResponse)
async def ask_question(
    question_in: QuestionCreate,
    room: Room = Depends(get_room_by_code),
    db: AsyncSession = Depends(get_db)
):
    check_room_expiration(room)
    
    # Profanity Check
    from utils import is_profane
    if is_profane(question_in.content):
        raise HTTPException(status_code=400, detail="Profanity/Inappropriate content detected.")
    
    # Soft Spam Prevention (Simple: 1 question per 10 seconds per voter? - Needs Redis or similar to track state)
    # Since we are "Stateless/DB only", we can check DB for recent questions by this voter in this room.
    
    # Check last question by this voter
    recent_q = await db.execute(
        select(Question)
        .join(Vote, Vote.question_id == Question.id, isouter=True) # Logic is tricky without a direct Voter table
        # We don't track who asked the question in the Question model explicitly (only voter_id in input)
        # Wait, Question model has NO voter_id?
        # PRD: "Anonymous". So we DO NOT store who asked it.
        # So we cannot rate limit easily by user without adding an IP or UUID column to Question.
        # "Soft client-side throttling" was requested.
        # "Input sanitization" handled by Pydantic.
    )

    new_question = Question(
        room_id=room.id,
        content=question_in.content
    )
    
    db.add(new_question)
    await db.commit()
    await db.refresh(new_question)
    
    # WebSocket Broadcast
    await manager.broadcast(
        {
            "type": "new_question",
            "id": new_question.id,
            "payload": {
                "content": new_question.content,
                "created_at": new_question.created_at.isoformat(),
                "votes": 0,
                "is_answered": False
            }
        },
        room.id
    )
    
    return new_question

@router.post("/{question_id}/vote", response_model=QuestionResponse)
async def upvote_question(
    question_id: str,
    vote_in: VoteCreate,
    room: Room = Depends(get_room_by_code),
    db: AsyncSession = Depends(get_db)
):
    check_room_expiration(room)
    
    # Verify question exists and belongs to room
    result = await db.execute(select(Question).where(Question.id == question_id, Question.room_id == room.id))
    question = result.scalars().first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
        
    # Check if already voted
    existing_vote = await db.execute(
        select(Vote).where(Vote.question_id == question_id, Vote.voter_id == vote_in.voter_id)
    )
    if existing_vote.scalars().first():
        # Already voted. Optionally toggle? PRD says "Each user can upvote a question once".
        # If they vote again, maybe ignore or error. Return current state.
        return question

    new_vote = Vote(question_id=question_id, voter_id=vote_in.voter_id)
    db.add(new_vote)
    
    # Update count denormalization
    question.votes += 1
    
    await db.commit()
    await db.refresh(question)
    
    # WebSocket Broadcast
    await manager.broadcast(
        {
            "type": "question_update",
            "id": question.id,
            "payload": {
                "votes": question.votes
            }
        },
        room.id
    )
    
    return question
