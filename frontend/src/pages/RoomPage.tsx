import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Clock, MessageSquare, Send, ThumbsUp, ChevronDown, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Type definitions
interface Question {
    id: string;
    content: string;
    votes: number;
    created_at: string;
    is_answered: boolean;
    organizer_reply?: string;
}

interface Room {
    id: string;
    title: string;
    code: string;
    is_active: boolean;
    created_at: string;
    starts_at: string;
    expires_at: string;
}

export default function RoomPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sortBy, setSortBy] = useState<'top' | 'latest'>('latest'); // Default to latest for chat feel
    const [newQuestion, setNewQuestion] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Voter ID Logic
    const [voterId] = useState(() => {
        let id = localStorage.getItem('hushhour_voter_id');
        if (!id) {
            id = crypto.randomUUID();
            localStorage.setItem('hushhour_voter_id', id);
        }
        return id;
    });

    const [votedQuestions, setVotedQuestions] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(`voted_${code}`);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    // 1. Fetch Room Info
    const { data: room, isLoading: roomLoading, error: roomError } = useQuery<Room>({
        queryKey: ['room', code],
        queryFn: () => fetcher(`/api/rooms/${code}`),
        retry: false,
    });

    // 2. Fetch Questions
    const { data: initialQuestions } = useQuery<Question[]>({
        queryKey: ['questions', room?.id, sortBy],
        queryFn: () => fetcher(`/api/rooms/${code}/questions?sort=${sortBy}`),
        enabled: !!room?.id,
    });

    // 3. Setup WebSocket
    const { lastMessage, status: wsStatus } = useRoomSocket(room?.id);

    // 4. Handle Real-time Updates
    useEffect(() => {
        if (lastMessage && room?.id) {
            queryClient.invalidateQueries({ queryKey: ['questions', room.id] });
            // Optionally scroll to bottom if new message and sorted by latest
            if (sortBy === 'latest') {
                // specific logic can act here if needed, but react's render cycle usually handles it via useEffect dependency
            }
        }
    }, [lastMessage, queryClient, room?.id, sortBy]);

    // Scroll to bottom on load/update if strict chat mode
    useEffect(() => {
        if (sortBy === 'latest') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [initialQuestions, sortBy]);


    // Mutations
    const postMutation = useMutation({
        mutationFn: (content: string) => api.post(`/api/rooms/${code}/questions`, { content, voter_id: voterId }),
        onMutate: async (content) => {
            await queryClient.cancelQueries({ queryKey: ['questions', room?.id] });
            const previousQuestions = queryClient.getQueryData<Question[]>(['questions', room?.id, sortBy]);

            const optimisticQuestion: Question = {
                id: `temp-${Date.now()}`,
                content,
                votes: 0,
                created_at: new Date().toISOString(),
                is_answered: false,
            };

            if (previousQuestions) {
                // optimistically append or prepend based on sort
                const newData = sortBy === 'latest'
                    ? [...previousQuestions, optimisticQuestion] // Chat style: append
                    : [optimisticQuestion, ...previousQuestions]; // Top style: prepend (newest usually)
                queryClient.setQueryData<Question[]>(['questions', room?.id, sortBy], newData);
            }

            return { previousQuestions };
        },
        onSuccess: () => {
            setNewQuestion('');
            if (sortBy === 'latest') {
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            }
            toast.success('Question sent!');
        },
        onError: (_err, _vars, context) => {
            if (context?.previousQuestions) {
                queryClient.setQueryData(['questions', room?.id, sortBy], context.previousQuestions);
            }
            toast.error("Failed to post question");
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['questions', room?.id] });
        }
    });

    const voteMutation = useMutation({
        mutationFn: (questionId: string) => api.post(`/api/rooms/${code}/questions/${questionId}/vote`, { voter_id: voterId }),
        onMutate: async (questionId) => {
            const queryKey = ['questions', room?.id, sortBy];
            await queryClient.cancelQueries({ queryKey });
            const previousQuestions = queryClient.getQueryData<Question[]>(queryKey);

            if (previousQuestions) {
                queryClient.setQueryData<Question[]>(queryKey, previousQuestions.map(q =>
                    q.id === questionId ? { ...q, votes: q.votes + 1 } : q
                ));
            }

            if (!votedQuestions.includes(questionId)) {
                const newVoted = [...votedQuestions, questionId];
                setVotedQuestions(newVoted);
                localStorage.setItem(`voted_${code}`, JSON.stringify(newVoted));
            }

            return { previousQuestions };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousQuestions) {
                queryClient.setQueryData(['questions', room?.id, sortBy], context.previousQuestions);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['questions', room?.id] });
        }
    });

    if (roomLoading) return <div className="flex h-screen items-center justify-center bg-zinc-950 text-zinc-400">Loading Room...</div>;
    if (roomError) return (
        <div className="flex flex-col h-screen items-center justify-center space-y-4 bg-zinc-950 text-zinc-50">
            <h1 className="text-2xl font-bold text-red-500">Room not found or expired</h1>
            <Button variant="outline" className="border-zinc-700 hover:bg-zinc-800 text-zinc-50" onClick={() => navigate('/')}>Go Home</Button>
        </div>
    );

    // Check if session is upcoming
    const now = new Date();
    const startsAt = room ? new Date(room.starts_at) : new Date();
    const isUpcoming = startsAt > now;

    if (isUpcoming) {
        return (
            <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4 text-zinc-50">
                <Card className="w-full max-w-md text-center bg-zinc-900 border-zinc-800">
                    <CardHeader>
                        <CardTitle className="text-2xl text-violet-400">Session Starting Soon</CardTitle>
                        <CardDescription className="text-zinc-400">This session hasn't started yet.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-violet-500/10 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                            <Clock className="w-10 h-10 text-violet-400" />
                        </div>
                        <div>
                            <p className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">Starts At</p>
                            <p className="text-xl font-bold mt-1 text-zinc-50">
                                {startsAt.toLocaleDateString()} {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <p className="text-sm text-zinc-400">
                            Join the waiting room. Chat opens when the session begins.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const questions = (initialQuestions || []).sort((a, b) => {
        if (sortBy === 'top') {
            // 1. Status: Unanswered first
            if (a.is_answered !== b.is_answered) return a.is_answered ? 1 : -1;
            // 2. Votes
            return b.votes - a.votes;
        }

        // latest (Chronological: Old -> New for Chat Experience)
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // Check expiration logic
    const isExpired = room ? new Date(room.expires_at) < new Date() : false;

    return (
        <div className="flex flex-col h-[100dvh] bg-zinc-950 text-zinc-50 overflow-hidden font-sans">
            {/* 1. Header (Fixed) */}
            <header className="flex-none bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800 z-50">
                <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold truncate tracking-tight">{room?.title}</h1>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-violet-500 animate-pulse"></span>
                                Live
                            </span>
                            <span>Code: <span className="font-mono text-zinc-300">{room?.code}</span></span>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 bg-zinc-900 rounded-lg p-1 border border-zinc-800">
                        <button
                            onClick={() => setSortBy('latest')}
                            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                sortBy === 'latest' ? "bg-zinc-800 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                        >
                            Chat
                        </button>
                        <button
                            onClick={() => setSortBy('top')}
                            className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                                sortBy === 'top' ? "bg-zinc-800 text-zinc-50 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}
                        >
                            Top
                        </button>
                    </div>
                </div>
            </header>

            {/* 2. Messages Area (Scrollable) */}
            <main className="flex-1 overflow-y-auto scroll-smooth">
                <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
                    {/* Empty State */}
                    {questions.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 text-zinc-600 opacity-50">
                            <Sparkles className="w-12 h-12 mb-3" />
                            <p>No questions yet. Start the conversation!</p>
                        </div>
                    )}

                    {/* Question List */}
                    {questions.map((q) => {
                        const hasVoted = votedQuestions.includes(q.id);
                        return (
                            <div key={q.id} className={cn("group flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                q.is_answered ? "opacity-60" : "opacity-100"
                            )}>
                                {/* Vote Action */}
                                <div className="flex-none pt-1">
                                    <button
                                        onClick={() => !hasVoted && !isExpired && voteMutation.mutate(q.id)}
                                        disabled={hasVoted || isExpired || voteMutation.isPending}
                                        className={cn(
                                            "flex flex-col items-center justify-center w-10 h-10 rounded-xl transition-all",
                                            hasVoted
                                                ? "bg-violet-500/20 text-violet-400"
                                                : "bg-zinc-900 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                                        )}
                                    >
                                        <ArrowUp className={cn("w-5 h-5", hasVoted && "fill-current")} />
                                    </button>
                                    <div className={cn("text-center text-[10px] font-bold mt-1", hasVoted ? "text-violet-500" : "text-zinc-600")}>
                                        {q.votes}
                                    </div>
                                </div>

                                {/* Content Bubble */}
                                <div className="flex-1 min-w-0">
                                    <div className={cn(
                                        "p-3 rounded-2xl rounded-tl-sm text-sm leading-relaxed break-words shadow-sm",
                                        q.is_answered
                                            ? "bg-zinc-900 text-zinc-500 border border-transparent"
                                            : "bg-zinc-900 border border-zinc-800 text-zinc-200"
                                    )}>
                                        {q.content}
                                    </div>

                                    {/* Meta & Reply */}
                                    <div className="mt-1.5 flex items-center gap-3 ml-1">
                                        <span className="text-[10px] text-zinc-600">
                                            {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                        {q.is_answered && (
                                            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-wide">
                                                Answered
                                            </span>
                                        )}
                                    </div>

                                    {/* Organizer Reply Block */}
                                    {q.organizer_reply && (
                                        <div className="mt-2 ml-2 pl-3 border-l-2 border-violet-500/50">
                                            <div className="text-[11px] font-bold text-violet-400 mb-0.5">Host Reply</div>
                                            <div className="text-sm text-zinc-400">{q.organizer_reply}</div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    <div ref={messagesEndRef} className="h-1" />
                </div>
            </main>

            {/* 3. Input Footer (Fixed) */}
            <footer className="flex-none bg-zinc-950 p-3 pt-2">
                <div className="max-w-3xl mx-auto">
                    {isExpired ? (
                        <div className="text-center py-3 bg-zinc-900 rounded-lg border border-zinc-800 text-zinc-500 text-sm">
                            This session has ended.
                        </div>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (newQuestion.trim()) postMutation.mutate(newQuestion);
                            }}
                            className="relative flex items-center gap-2"
                        >
                            <Input
                                placeholder="Type a message..."
                                value={newQuestion}
                                onChange={(e) => setNewQuestion(e.target.value)}
                                className="bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 rounded-full pl-5 pr-12 py-6 focus-visible:ring-violet-500/50"
                                disabled={postMutation.isPending}
                                autoFocus
                            />
                            <Button
                                type="submit"
                                size="icon"
                                disabled={postMutation.isPending || !newQuestion.trim()}
                                className="absolute right-1.5 top-1.5 h-9 w-9 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-900/20"
                            >
                                <Send className="w-4 h-4 ml-0.5" />
                            </Button>
                        </form>
                    )}
                </div>
            </footer>
        </div>
    );
}
