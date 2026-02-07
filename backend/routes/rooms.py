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
from connection_manager import manager

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
    
    new_room = Room(
        code=code,
        title=room_in.title,
        organizer_token=organizer_token,
        starts_at=room_in.starts_at,
        expires_at=room_in.expires_at,
        status="WAITING" # Explicit default
    )
    
    db.add(new_room)
    await db.commit()
    await db.refresh(new_room)

    # Generate QR Code
    join_url = f"https://hushhour.app/r/{code}"
    qr_base64 = generate_qr_code_base64(join_url)

    return RoomCreatedResponse(
        id=new_room.id,
        code=new_room.code,
        title=new_room.title,
        created_at=new_room.created_at,
        starts_at=new_room.starts_at,
        expires_at=new_room.expires_at,
        is_active=new_room.is_active,
        status=new_room.status,
        organizer_token=organizer_token,
        qr_code=qr_base64
    )

@router.get("/{room_code}", response_model=RoomResponse)
async def get_room(
    room: Room = Depends(get_room_by_code)
):
    # If status is ENDED, we might still want to show it, but check expiration
    # check_room_expiration(room) # Maybe relax this for manual controls? 
    # Let's keep strict expiration for now but manual 'end' sets status.
    return room

# --- Session Controls ---

@router.post("/{code}/start", response_model=RoomResponse)
async def start_session(
    code: str, 
    token: str, # Organizer token required
    db: AsyncSession = Depends(get_db)
):
    room = await get_room_by_code(code, db)
    if room.organizer_token != token:
        raise HTTPException(status_code=403, detail="Invalid organizer token")
    
    room.status = "LIVE"
    await db.commit()
    await db.refresh(room)
    
    await manager.broadcast({"type": "ROOM_STATUS_UPDATE", "status": "LIVE"}, room.id)
    return room

@router.post("/{code}/end", response_model=RoomResponse)
async def end_session(
    code: str, 
    token: str, 
    db: AsyncSession = Depends(get_db)
):
    room = await get_room_by_code(code, db)
    if room.organizer_token != token:
        raise HTTPException(status_code=403, detail="Invalid organizer token")
    
    room.status = "ENDED"
    await db.commit()
    await db.refresh(room)
    
    await manager.broadcast({"type": "ROOM_STATUS_UPDATE", "status": "ENDED"}, room.id)
    return room

@router.post("/{code}/extend", response_model=RoomResponse)
async def extend_session(
    code: str, 
    token: str, 
    minutes: int = 15,
    db: AsyncSession = Depends(get_db)
):
    room = await get_room_by_code(code, db)
    if room.organizer_token != token:
        raise HTTPException(status_code=403, detail="Invalid organizer token")
    
    room.expires_at += timedelta(minutes=minutes)
    await db.commit()
    await db.refresh(room)
    
    await manager.broadcast({
        "type": "ROOM_EXTENDED", 
        "expires_at": room.expires_at.isoformat(),
        "minutes_added": minutes
    }, room.id)
    return room
