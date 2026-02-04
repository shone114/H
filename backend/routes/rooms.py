from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import timedelta
import base64

from database import get_db
from models import Room
from schemas import RoomCreate, RoomCreatedResponse, RoomResponse
from utils import generate_room_code, generate_organizer_token, get_utc_now, generate_qr_code_base64
from security import get_room_by_code, check_room_expiration

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

@router.post("/", response_model=RoomCreatedResponse)
async def create_room(room_in: RoomCreate, db: AsyncSession = Depends(get_db)):
    # Generate unique code
    for _ in range(5):
        code = generate_room_code()
        # Check uniqueness
        existing = await db.execute(select(Room).where(Room.code == code))
        if not existing.scalars().first():
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate unique room code")

    organizer_token = generate_organizer_token()
    expires_at = get_utc_now() + timedelta(hours=room_in.expires_hours)

    new_room = Room(
        code=code,
        title=room_in.title,
        organizer_token=organizer_token,
        expires_at=expires_at
    )
    
    db.add(new_room)
    await db.commit()
    await db.refresh(new_room)

    # Generate QR Code
    # In prod, this URL would be dynamic based on the frontend deployment
    # For now we use a placeholder or relative path that frontend handles
    join_url = f"https://hushhour.app/r/{code}" # or get from env
    qr_base64 = generate_qr_code_base64(join_url)

    return RoomCreatedResponse(
        id=new_room.id,
        code=new_room.code,
        title=new_room.title,
        created_at=new_room.created_at,
        expires_at=new_room.expires_at,
        is_active=new_room.is_active,
        organizer_token=organizer_token,
        qr_code=qr_base64
    )

@router.get("/{room_code}", response_model=RoomResponse)
async def get_room(
    room: Room = Depends(get_room_by_code)
):
    check_room_expiration(room)
    return room
