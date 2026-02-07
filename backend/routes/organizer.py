from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from typing import List
import os

from database import get_db
from models import Question, Room
from schemas import QuestionResponse, RoomResponse, OrganizerReply, DashboardResponse
from security import verify_organizer_token
from connection_manager import manager

from utils import generate_qr_code_base64

router = APIRouter(prefix="/api/organizer", tags=["organizer"])

@router.get("/{room_code}/{token}", response_model=DashboardResponse)
async def get_dashboard_data(
    room: Room = Depends(verify_organizer_token),
    db: AsyncSession = Depends(get_db)
):
    # Fetch questions
    result = await db.execute(
        select(Question)
        .where(Question.room_id == room.id)
        .order_by(desc(Question.created_at))
    )
    questions = result.scalars().all()
    
    # Generate QR Code
    from utils import get_frontend_url
    join_url = f"{get_frontend_url()}/r/{room.code}" 
    qr_base64 = generate_qr_code_base64(join_url)

    return {
        "room": room,
        "questions": questions,
        "qr_code": qr_base64
    }

@router.post("/{room_code}/{token}/reply/{question_id}", response_model=QuestionResponse)
async def reply_question(
    question_id: str,
    reply_in: OrganizerReply,
    room: Room = Depends(verify_organizer_token),
    db: AsyncSession = Depends(get_db)
):
    # Verify room is active
    from security import check_room_expiration
    check_room_expiration(room)

    # Verify question exists
    result = await db.execute(select(Question).where(Question.id == question_id, Question.room_id == room.id))
    question = result.scalars().first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # Profanity Check
    from utils import is_profane
    if is_profane(reply_in.reply_text):
        raise HTTPException(status_code=400, detail="Profanity/Inappropriate content detected.")

    question.organizer_reply = reply_in.reply_text
    question.is_answered = True
    
    await db.commit()
    await db.refresh(question)
    
    # WebSocket Broadcast
    await manager.broadcast(
        {
            "type": "question_update", 
            "id": question.id, 
            "payload": {
                "organizer_reply": question.organizer_reply,
                "is_answered": True
            }
        }, 
        room.id
    )
    
    return question

@router.post("/{room_code}/{token}/mark_answered/{question_id}", response_model=QuestionResponse)
async def mark_answered(
    question_id: str,
    room: Room = Depends(verify_organizer_token),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Question).where(Question.id == question_id, Question.room_id == room.id))
    question = result.scalars().first()
    
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    question.is_answered = True
    await db.commit()
    await db.refresh(question)

    # WebSocket Broadcast
    await manager.broadcast(
        {
            "type": "question_update", 
            "id": question.id, 
            "payload": {
                "is_answered": True
            }
        }, 
        room.id
    )
    
    return question
