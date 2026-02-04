from fastapi import Depends, HTTPException, status, Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database import get_db
from models import Room
import datetime

async def get_room_by_code(
    room_code: str = Path(..., min_length=6, max_length=6),
    db: AsyncSession = Depends(get_db)
) -> Room:
    """Dependency to fetch a room by code and check if it exists & is active."""
    result = await db.execute(select(Room).where(Room.code == room_code.upper()))
    room = result.scalars().first()

    if not room:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Room not found"
        )
    
    return room

async def verify_organizer_token(
    room_code: str = Path(..., min_length=6, max_length=6),
    token: str = Path(..., min_length=10),
    db: AsyncSession = Depends(get_db)
) -> Room:
    """Dependency to verify organizer access to a room."""
    # We reuse logic to find room first, but we need the token check
    result = await db.execute(select(Room).where(Room.code == room_code.upper()))
    room = result.scalars().first()

    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if room.organizer_token != token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid organizer token"
        )
    
    return room

def check_room_expiration(room: Room):
    """Helper to raise error if room is expired."""
    if room.expires_at < datetime.datetime.utcnow():
        raise HTTPException(
             status_code=status.HTTP_400_BAD_REQUEST,
             detail="Room has expired"
        )
    return room
