import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Clock, Send, Sparkles, Trophy, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Type definitions (Vercel Redeploy Trigger)
// is this good now ?
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
    status: 'WAITING' | 'LIVE' | 'ENDED';
}

export default function RoomPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sortBy, setSortBy] = useState<'top' | 'latest' | 'answered'>('top');
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

    // "My Questions" Logic (Frontend-only)
    const [myQuestionIds, setMyQuestionIds] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(`my_questions_${code}`);
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
    // 4. Handle Real-time Updates
    useEffect(() => {
        if (lastMessage && room?.id) {
            // If status changed or extended, refresh room details
            if (lastMessage.type === 'ROOM_STATUS_UPDATE' || lastMessage.type === 'ROOM_EXTENDED') {
                queryClient.invalidateQueries({ queryKey: ['room', code] });
            }
            // Refresh questions for typical messages
            queryClient.invalidateQueries({ queryKey: ['questions', room.id] });
        }
    }, [lastMessage, queryClient, room?.id, code]);

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
        onSuccess: (newQ) => {
            setNewQuestion('');
            if (newQ && newQ.data && newQ.data.id) {
                const newIds = [...myQuestionIds, newQ.data.id];
                setMyQuestionIds(newIds);
                localStorage.setItem(`my_questions_${code}`, JSON.stringify(newIds));
            }
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

    if (roomLoading) return <div className="flex h-screen items-center justify-center bg-soft-charcoal text-gentle-grey">Loading Room...</div>;
    if (roomError) return (
        <div className="flex flex-col h-screen items-center justify-center space-y-4 bg-soft-charcoal text-soft-white">
            <h1 className="text-2xl font-bold text-red-400">Room not found or expired</h1>
            <Button variant="outline" className="text-soft-white border-soft-border hover:bg-ink-grey rounded-full" onClick={() => navigate('/')}>Go Home</Button>
        </div>
    );

    if (room?.status === 'WAITING') {
        return (
            <div className="min-h-screen bg-soft-charcoal flex items-center justify-center p-4 text-soft-white animate-in fade-in duration-700">
                <Card className="w-full max-w-md text-center bg-ink-grey border-soft-border shadow-md rounded-3xl">
                    <CardContent className="space-y-6 pt-10 pb-10">
                        <div className="relative">
                            <div className="absolute inset-0 bg-soft-indigo/20 blur-xl rounded-full animate-pulse"></div>
                            <div className="relative bg-soft-indigo/10 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center ring-1 ring-soft-indigo/30">
                                <Clock className="w-10 h-10 text-soft-indigo" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <p className="text-xs text-gentle-grey uppercase tracking-widest font-bold">Waiting for Host</p>
                            <h2 className="text-2xl font-bold text-soft-white">{room.title}</h2>
                            <p className="text-gentle-grey font-medium">The session will begin shortly.</p>
                        </div>
                        <div className="flex justify-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-soft-indigo/50 animate-bounce [animation-delay:-0.3s]"></span>
                            <span className="w-2 h-2 rounded-full bg-soft-indigo/50 animate-bounce [animation-delay:-0.15s]"></span>
                            <span className="w-2 h-2 rounded-full bg-soft-indigo/50 animate-bounce"></span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }



    const questions = (initialQuestions || []).filter(q => {
        if (sortBy === 'answered') return q.is_answered;
        return true;
    }).sort((a, b) => {
        if (sortBy === 'top' || sortBy === 'answered') {
            // For 'answered' tab, we just sort by votes (or we could do time). Let's do votes.
            // For 'top', we push answered to bottom.
            if (sortBy === 'top' && a.is_answered !== b.is_answered) return a.is_answered ? 1 : -1;
            return b.votes - a.votes;
        }
        // Latest: Old -> New
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return (
        <div className="flex flex-col h-[100dvh] bg-soft-charcoal text-soft-white font-sans selection:bg-washed-blue/30 selection:text-soft-white">

            {/* 1. Integrated Header (Full Width, Soft Charcoal) */}
            <header className="flex-none z-50 sticky top-0 bg-soft-charcoal/95 backdrop-blur-md border-b border-soft-border shadow-sm">
                <div className="w-full max-w-6xl mx-auto px-4 py-3">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 md:gap-4">

                        {/* Title & Status */}
                        <div className="flex items-center gap-3 overflow-hidden">
                            <div className="w-2.5 h-2.5 rounded-full bg-muted-mint animate-pulse shadow-[0_0_8px_rgba(134,215,176,0.4)] flex-shrink-0"></div>
                            <div className="min-w-0">
                                <h1 className="text-sm md:text-base font-bold text-soft-white truncate leading-tight">{room?.title}</h1>
                                <div>
                                    <span className="md:hidden text-[10px] font-mono text-gentle-grey bg-ink-grey px-1.5 py-0.5 rounded uppercase tracking-wider">{room?.code}</span>
                                </div>
                            </div>
                            {/* Desktop Code Badge */}
                            <span className="hidden md:inline-flex text-[11px] font-mono font-bold text-gentle-grey bg-ink-grey px-2 py-0.5 rounded-full tracking-wider border border-soft-border">{room?.code}</span>
                        </div>

                        {/* Controls */}
                        <div className="flex items-center justify-between md:justify-end gap-2 w-full md:w-auto">
                            <span className="text-xs text-muted-text font-medium md:hidden">Sort by:</span>
                            <div className="flex items-center gap-1 bg-ink-grey p-1 rounded-full border border-soft-border">
                                <button
                                    onClick={() => setSortBy('top')}
                                    className={cn("px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                                        sortBy === 'top' ? "bg-soft-border text-soft-white shadow-sm" : "text-gentle-grey hover:bg-soft-border/50 hover:text-soft-white")}
                                >
                                    <Trophy className="w-3 h-3" /> Top
                                </button>
                                <button
                                    onClick={() => setSortBy('latest')}
                                    className={cn("px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                                        sortBy === 'latest' ? "bg-soft-border text-soft-white shadow-sm" : "text-gentle-grey hover:bg-soft-border/50 hover:text-soft-white")}
                                >
                                    <Clock className="w-3 h-3" /> <span className="hidden sm:inline">Latest</span><span className="sm:hidden">New</span>
                                </button>
                                <button
                                    onClick={() => setSortBy('answered')}
                                    className={cn("px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5",
                                        sortBy === 'answered' ? "bg-muted-mint/20 text-muted-mint shadow-sm border border-muted-mint/20" : "text-gentle-grey hover:bg-soft-border/50 hover:text-soft-white")}
                                >
                                    <CheckCircle2 className="w-3 h-3" /> <span className="hidden sm:inline">Answered</span><span className="sm:hidden">Done</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* 2. Main Content */}
            <main className="flex-1 overflow-y-auto scroll-smooth">
                <div className="max-w-6xl mx-auto px-4 md:px-6 py-8 pb-32">
                    {/* Empty State */}
                    {questions.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-24 text-muted-text text-center animate-in fade-in duration-700">
                            <div className="bg-ink-grey p-8 rounded-full mb-6 shadow-sm border border-soft-border ring-4 ring-soft-charcoal">
                                <Sparkles className="w-12 h-12 text-washed-blue" />
                            </div>
                            <h3 className="text-xl font-bold text-soft-white mb-2">It's quiet in here...</h3>
                            <p className="max-w-xs mx-auto text-gentle-grey text-sm">Be the first to ask! Your question is safe here.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {questions.map((q) => {
                                const hasVoted = votedQuestions.includes(q.id);
                                const isAnswered = q.is_answered;
                                const isMine = myQuestionIds.includes(q.id);

                                return (
                                    <div key={q.id} className={cn(
                                        "group relative flex gap-4 md:gap-5 p-5 md:p-6 rounded-3xl transition-all duration-300 border animate-in slide-in-from-bottom-2",
                                        isAnswered
                                            ? "bg-muted-mint/5 border-muted-mint/20 shadow-sm" // Warm Answered State
                                            : isMine
                                                ? "bg-soft-indigo/5 border-soft-indigo/50 shadow-md ring-1 ring-soft-indigo/20" // "My Question" Highlight
                                                : "bg-ink-grey border-soft-border hover:border-soft-border/80 hover:bg-[#2A2C2E] shadow-sm" // Standard Dark Card
                                    )}>
                                        {/* Answered Indicator */}
                                        {isAnswered && (
                                            <div className="absolute top-4 right-4 md:top-6 md:right-6">
                                                <Badge className="bg-muted-mint/10 text-muted-mint border-muted-mint/20 border shadow-none rounded-full px-3 py-1 flex gap-1.5 text-[10px] sm:text-xs font-bold uppercase tracking-wide opacity-90">
                                                    <CheckCircle2 className="w-3 h-3" /> Answered
                                                </Badge>
                                            </div>
                                        )}

                                        {/* Vote Button */}
                                        <div className="flex-none pt-1">
                                            <button
                                                onClick={() => !hasVoted && room?.status === 'LIVE' && voteMutation.mutate(q.id)}
                                                disabled={hasVoted || room?.status !== 'LIVE' || voteMutation.isPending}
                                                className={cn(
                                                    "flex flex-col items-center justify-center w-12 h-12 md:w-14 md:h-14 rounded-2xl transition-all border",
                                                    hasVoted
                                                        ? "bg-soft-indigo/20 border-soft-indigo/40 text-soft-indigo shadow-[0_0_15px_-5px_rgba(142,154,254,0.3)] scale-105"
                                                        : "bg-soft-charcoal border-transparent text-muted-text hover:bg-soft-border hover:text-soft-white hover:scale-105"
                                                )}
                                            >
                                                <ArrowUp className={cn("w-5 h-5 md:w-6 md:h-6 mb-0.5", hasVoted && "fill-current")} />
                                                <span className="text-xs md:text-sm font-bold">{q.votes}</span>
                                            </button>
                                        </div>

                                        {/* Question Content */}
                                        <div className="flex-1 min-w-0 space-y-2">
                                            <div className="prose prose-invert prose-sm max-w-none">
                                                <p className={cn(
                                                    "text-base md:text-lg leading-relaxed font-medium transition-colors",
                                                    isAnswered ? "text-gentle-grey" : "text-soft-white"
                                                )}>
                                                    {q.content}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-4 text-[10px] md:text-xs font-medium text-muted-text uppercase tracking-wide">
                                                <span>{new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>

                                            {/* Organizer Reply */}
                                            {q.organizer_reply && (
                                                <div className="mt-3 bg-soft-charcoal/50 border border-washed-blue/20 rounded-2xl p-4 md:p-5 relative overflow-hidden">
                                                    <div className="absolute top-0 left-0 w-1 h-full bg-washed-blue"></div>
                                                    <div className="flex items-center gap-2 mb-1.5">
                                                        <Badge variant="secondary" className="bg-washed-blue/10 text-washed-blue hover:bg-washed-blue/20 border-0 rounded-full px-2 py-0 text-[10px] font-bold">HOST REPLY</Badge>
                                                    </div>
                                                    <p className="text-gentle-grey text-sm leading-relaxed">{q.organizer_reply}</p>
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
                <div className="max-w-5xl mx-auto pointer-events-auto">
                    {room?.status === 'ENDED' ? (
                        <div className="bg-ink-grey/90 backdrop-blur-md rounded-full border border-soft-border p-4 text-center text-muted-text shadow-lg">
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
                            {/* Gentle Glow */}
                            <div className="absolute -inset-1 bg-gradient-to-r from-soft-indigo/10 to-washed-blue/10 rounded-full opacity-0 group-focus-within:opacity-100 transition duration-700 blur-md"></div>

                            <div className="relative flex items-center bg-ink-grey rounded-full shadow-lg border border-soft-border group-focus-within:border-soft-indigo/50 transition-all">
                                <Input
                                    placeholder="Type your question anonymously..."
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    className="w-full bg-transparent border-0 text-soft-white placeholder:text-muted-text rounded-full pl-6 pr-16 py-7 text-base md:text-lg focus-visible:ring-0 focus-visible:ring-offset-0"
                                    disabled={postMutation.isPending}
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={postMutation.isPending || !newQuestion.trim()}
                                    className="absolute right-2 h-10 w-10 rounded-full bg-soft-indigo hover:bg-[#7D8BEF] text-white shadow-[0_0_15px_-3px_rgba(142,154,254,0.3)] transition-all active:scale-95"
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
