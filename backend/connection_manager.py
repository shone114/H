from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set
import json

class ConnectionManager:
    def __init__(self):
        # Room ID -> Set of WebSockets
        self.active_connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = set()
        self.active_connections[room_id].add(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: dict, room_id: str):
        if room_id in self.active_connections:
            # Convert to JSON string
            json_msg = json.dumps(message)
            # Create a copy to track removals if connection fails during iteration
            to_remove = set()
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_text(json_msg)
                except Exception:
                    to_remove.add(connection)
            
            for conn in to_remove:
                self.disconnect(conn, room_id)

manager = ConnectionManager()
