from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from connection_manager import manager
from security import get_room_by_code
# Note: get_room_by_code is async and uses DB, might be tricky in WS handshake if not careful.
# Usually we validate room_id directly or handle it inside the websocket endpoint.

router = APIRouter(tags=["websocket"])

@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    # Here we might want to validate the room exists first?
    # Or just let them join the channel. If they join a non-existent channel, they just hear silence.
    # For HushHour, validating existence is good practice.
    
    await manager.connect(websocket, room_id)
    try:
        while True:
            # We mostly push FROM server, but maybe we accept heartbeat ping/pong
            data = await websocket.receive_text()
            # If client sends "ping", we can pont back or just ignore.
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
