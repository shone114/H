export interface Question {
    id: string;
    content: string;
    votes: number;
    created_at: string;
    is_answered: boolean;
    organizer_reply?: string;
}

export interface Room {
    id: string;
    title: string;
    code: string;
    is_active?: boolean; // Usage varies slightly, keeping optional
    created_at?: string;
    starts_at?: string;
    expires_at: string;
    status: 'WAITING' | 'LIVE' | 'ENDED';
    qr_code?: string; // Dashboard specific
}
