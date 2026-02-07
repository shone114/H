import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Clock, MessageSquare, Send, Sparkles, Trophy, CheckCircle2 } from 'lucide-react';
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
    const [sortBy, setSortBy] = useState<'top' | 'latest'>('top');
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
    const { lastMessage } = useRoomSocket(room?.id);

    // 4. Handle Real-time Updates
    useEffect(() => {
        if (lastMessage && room?.id) {
            queryClient.invalidateQueries({ queryKey: ['questions', room.id] });
        }
    }, [lastMessage, queryClient, room?.id]);

    // Scroll to bottom only on strict 'latest' mode switch
    useEffect(() => {
        if (sortBy === 'latest') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [sortBy]);


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
                const newData = sortBy === 'latest'
                    ? [...previousQuestions, optimisticQuestion] // Latest: Append (Chat style)
                    : [optimisticQuestion, ...previousQuestions]; // Top: Prepend (Newest)
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
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['questions', room?.id] });
        }
    });

    if (roomLoading) return <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">Loading Room...</div>;
    if (roomError) return (
        <div className="flex flex-col h-screen items-center justify-center space-y-4 bg-slate-950 text-slate-50">
            <h1 className="text-2xl font-bold text-red-500">Room not found or expired</h1>
            <Button variant="outline" className="text-slate-900 rounded-full" onClick={() => navigate('/')}>Go Home</Button>
        </div>
    );

    const now = new Date();
    const startsAt = room ? new Date(room.starts_at) : new Date();
    const isUpcoming = startsAt > now;
    const isExpired = room ? new Date(room.expires_at) < new Date() : false;

    if (isUpcoming) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-50">
                <Card className="w-full max-w-md text-center bg-slate-900/50 border-slate-800 rounded-3xl backdrop-blur-xl">
                    <CardContent className="space-y-6 pt-10 pb-10">
                        <div className="bg-indigo-500/20 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center ring-1 ring-indigo-500/50 shadow-[0_0_30px_-5px_rgba(99,102,241,0.3)]">
                            <Clock className="w-10 h-10 text-indigo-400" />
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Starts At</p>
                            <p className="text-3xl font-bold text-slate-100 tracking-tight">
                                {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <p className="text-slate-500 font-medium">{startsAt.toLocaleDateString()}</p>
                        </div>
                        <p className="text-sm text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                            The room will open automatically when the session begins.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const questions = (initialQuestions || []).sort((a, b) => {
        if (sortBy === 'top') {
            // Answered questions first if we want them seen? 
            // OR Unanswered first to be voted on? 
            // User strategy: "Answered should have most visibility so people don't repeat".
            // Let's put Answered at the VERY TOP.
            if (a.is_answered !== b.is_answered) return a.is_answered ? -1 : 1; // Answered (-1) first
            return b.votes - a.votes;
        }
        // Latest: Old -> New
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-950 text-slate-50 font-sans selection:bg-indigo-500/30">
            {/* 1. Header (Floating Glass) */}
            <header className="flex-none z-50 pt-4 px-4 sticky top-0">
                <div className="max-w-4xl mx-auto bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl shadow-black/50">
                    <div className="min-w-0 flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-100 truncate max-w-[150px] md:max-w-xs">{room?.title}</h1>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-full border border-white/5">
                        <button
                            onClick={() => setSortBy('top')}
                            className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                                sortBy === 'top' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}
                        >
                            <Trophy className="w-3 h-3" /> Top
                        </button>
                        <button
                            onClick={() => setSortBy('latest')}
                            className={cn("px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                                sortBy === 'latest' ? "bg-slate-700 text-white shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-slate-800")}
                        >
                            <Clock className="w-3 h-3" /> Latest
                        </button>
                    </div>
                </div>
            </header>

            {/* 2. Main Content */}
            <main className="flex-1 overflow-y-auto scroll-smooth">
                <div className="max-w-4xl mx-auto px-4 md:px-6 py-8 pb-32">
                    <div className="text-center mb-8 space-y-1">
                        <p className="text-xs font-medium text-slate-500 uppercase tracking-widest">Room Code</p>
                        <p className="text-4xl font-black text-slate-200 tracking-tighter font-mono">{room?.code}</p>
                    </div>

                    {questions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-slate-500 text-center animate-in fade-in duration-700">
                            <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-8 rounded-full mb-6 shadow-Inner ring-1 ring-white/5">
                                <Sparkles className="w-12 h-12 text-indigo-400" />
                            </div>
                            <h3 className="text-xl font-bold text-slate-200 mb-2">The stage is empty</h3>
                            <p className="max-w-xs mx-auto text-slate-400">Be the brave soul to ask the first question.</p>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {questions.map((q) => {
                                const hasVoted = votedQuestions.includes(q.id);
                                const isAnswered = q.is_answered;

                                return (
                                    <div key={q.id} className={cn(
                                        "group relative flex gap-5 p-6 rounded-3xl transition-all duration-300 border",
                                        isAnswered
                                            ? "bg-gradient-to-br from-emerald-950/30 to-slate-900/50 border-emerald-500/30 shadow-[0_0_20px_-10px_rgba(16,185,129,0.2)]"
                                            : "bg-slate-900/40 border-white/5 hover:border-white/10 hover:bg-slate-900/60 shadow-lg"
                                    )}>
                                        {/* Answered Badge - Absolute */}
                                        {isAnswered && (
                                            <div className="absolute -top-3 -right-3">
                                                <Badge className="bg-emerald-500 hover:bg-emerald-600 text-white border-0 shadow-lg shadow-emerald-900/50 rounded-full px-3 py-1 flex gap-1.5 text-xs font-bold uppercase tracking-wide">
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Answered
                                                </Badge>
                                            </div>
                                        )}

                                        {/* Vote Button */}
                                        <div className="flex-none">
                                            <button
                                                onClick={() => !hasVoted && !isExpired && voteMutation.mutate(q.id)}
                                                disabled={hasVoted || isExpired || voteMutation.isPending}
                                                className={cn(
                                                    "flex flex-col items-center justify-center w-14 h-14 rounded-2xl transition-all border-2",
                                                    hasVoted
                                                        ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20 scale-105"
                                                        : "bg-slate-800/50 border-transparent text-slate-500 hover:bg-slate-800 hover:text-slate-300 hover:scale-105"
                                                )}
                                            >
                                                <ArrowUp className={cn("w-6 h-6 mb-0.5", hasVoted && "fill-current")} />
                                                <span className="text-sm font-bold">{q.votes}</span>
                                            </button>
                                        </div>

                                        {/* Question Content */}
                                        <div className="flex-1 min-w-0 space-y-3">
                                            <div className="prose prose-invert max-w-none">
                                                <p className={cn(
                                                    "text-lg leading-relaxed font-medium transition-colors",
                                                    isAnswered ? "text-emerald-50" : "text-slate-200"
                                                )}>
                                                    {q.content}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
                                                <span>{new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>

                                            {/* Organizer Reply */}
                                            {q.organizer_reply && (
                                                <div className="mt-4 bg-slate-950/50 border border-indigo-500/30 rounded-2xl p-5 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Badge variant="secondary" className="bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border-0 rounded-full px-2 text-[10px]">HOST</Badge>
                                                    </div>
                                                    <p className="text-slate-300 text-sm leading-relaxed">{q.organizer_reply}</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} className="h-1" />
                        </div>
                    )}
                </div>
            </main>

            {/* 3. Input Footer (Floating Capsule) */}
            <footer className="flex-none fixed bottom-6 left-0 right-0 px-4 z-50 pointer-events-none">
                <div className="max-w-3xl mx-auto pointer-events-auto">
                    {isExpired ? (
                        <div className="bg-slate-900/90 backdrop-blur-md rounded-full border border-slate-700 p-4 text-center text-slate-400 shadow-2xl">
                            <span className="flex items-center justify-center gap-2 font-medium">
                                <Clock className="w-4 h-4" /> This session has ended.
                            </span>
                        </div>
                    ) : (
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (newQuestion.trim()) postMutation.mutate(newQuestion);
                            }}
                            className="relative group"
                        >
                            <div className="absolute -inset-0.5 bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full opacity-20 group-focus-within:opacity-50 transition duration-500 blur"></div>
                            <div className="relative flex items-center">
                                <Input
                                    placeholder="Ask a question..."
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    className="w-full bg-slate-900/90 backdrop-blur-xl border-slate-700/50 text-slate-100 placeholder:text-slate-500 rounded-full pl-6 pr-16 py-7 text-lg shadow-2xl focus-visible:ring-0 focus-visible:border-slate-600 transition-all"
                                    disabled={postMutation.isPending}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={postMutation.isPending || !newQuestion.trim()}
                                    className="absolute right-2 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/20 transition-all active:scale-95"
                                >
                                    <Send className="w-5 h-5 ml-0.5" />
                                </Button>
                            </div>
                        </form>
                    )}
                </div>
            </footer>
        </div>
    );
}
