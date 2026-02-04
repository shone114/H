import { useEffect, useRef, useState, useCallback } from 'react';

const SOCKET_URL = ((import.meta as any).env.VITE_API_URL || 'http://localhost:8000').replace(/^http/, 'ws');

type WebSocketStatus = 'connecting' | 'connected' | 'disconnected';

export function useRoomSocket(roomId: string | undefined) {
    const [status, setStatus] = useState<WebSocketStatus>('disconnected');
    const [lastMessage, setLastMessage] = useState<any>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<number | undefined>(undefined);

    const connect = useCallback(() => {
        if (!roomId) return;

        const url = `${SOCKET_URL}/ws/${roomId}`;
        const ws = new WebSocket(url);

        setStatus('connecting');

        ws.onopen = () => {
            setStatus('connected');
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = undefined;
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                setLastMessage(data);
            } catch (e) {
                console.error("Failed to parse WS message", event.data);
            }
        };

        ws.onclose = () => {
            setStatus('disconnected');
            wsRef.current = null;
            // Auto reconnect
            reconnectTimeoutRef.current = setTimeout(() => {
                connect();
            }, 3000) as unknown as number;
        };

        ws.onerror = (error) => {
            console.error("WebSocket error:", error);
            ws.close();
        };

        wsRef.current = ws;
    }, [roomId]);

    useEffect(() => {
        if (roomId) {
            connect();
        }
        return () => {
            if (wsRef.current) {
                wsRef.current.close();
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
            }
        };
    }, [roomId, connect]);

    return { status, lastMessage };
}
