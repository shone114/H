import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Clock, MessageSquare } from 'lucide-react';
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
    expires_at: string;
}

export default function RoomPage() {
    const { code } = useParams<{ code: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sortBy, setSortBy] = useState<'top' | 'latest'>('top');
    const [newQuestion, setNewQuestion] = useState('');
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
        }
    }, [lastMessage, queryClient, room?.id]);

    // Mutations
    const postMutation = useMutation({
        mutationFn: (content: string) => api.post(`/api/rooms/${code}/questions`, { content, voter_id: voterId }),
        onMutate: async (content) => {
            // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
            await queryClient.cancelQueries({ queryKey: ['questions', room?.id] });

            // Snapshot the previous value
            const previousQuestions = queryClient.getQueryData<Question[]>(['questions', room?.id, sortBy]);

            // Optimistically update to the new value
            if (previousQuestions) {
                const optimisticQuestion: Question = {
                    id: `temp-${Date.now()}`,
                    content,
                    votes: 0,
                    created_at: new Date().toISOString(),
                    is_answered: false,
                };

                // Add to start or end based on sort? Typically new questions are at top if latest, or bottom/top if top (0 votes).
                // Let's prepend it for immediate feedback regardless of sort, or maybe obey sort?
                // For 'latest', prepend. For 'top', it has 0 votes, so append? 
                // Let's just prepend to make it visible.
                queryClient.setQueryData<Question[]>(['questions', room?.id, sortBy], [optimisticQuestion, ...previousQuestions]);
            }

            return { previousQuestions };
        },
        onSuccess: () => {
            setNewQuestion('');
            toast.success('Question added!');
        },
        onError: (_err, _newTodo, context) => {
            // Rollback
            if (context?.previousQuestions) {
                queryClient.setQueryData(['questions', room?.id, sortBy], context.previousQuestions);
            }
            toast.error("Failed to post question");
        },
        onSettled: () => {
            // Always refetch after error or success to sync with server
            queryClient.invalidateQueries({ queryKey: ['questions', room?.id] });
        }
    });

    const voteMutation = useMutation({
        mutationFn: (questionId: string) => api.post(`/api/rooms/${code}/questions/${questionId}/vote`, { voter_id: voterId }),
        onMutate: async (questionId) => {
            // Optimistic Update
            const queryKey = ['questions', room?.id, sortBy];
            await queryClient.cancelQueries({ queryKey });
            const previousQuestions = queryClient.getQueryData<Question[]>(queryKey);

            if (previousQuestions) {
                queryClient.setQueryData<Question[]>(queryKey, previousQuestions.map(q =>
                    q.id === questionId ? { ...q, votes: q.votes + 1 } : q
                ));
            }

            // Optimistic local state update
            if (!votedQuestions.includes(questionId)) {
                const newVoted = [...votedQuestions, questionId];
                setVotedQuestions(newVoted);
                localStorage.setItem(`voted_${code}`, JSON.stringify(newVoted));
            }

            return { previousQuestions };
        },
        onError: (_err, _newTodo, context) => {
            if (context?.previousQuestions) {
                queryClient.setQueryData(['questions', room?.id, sortBy], context.previousQuestions);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['questions', room?.id] });
        }
    });

    if (roomLoading) return <div className="flex h-screen items-center justify-center">Loading Room...</div>;
    if (roomError) return (
        <div className="flex flex-col h-screen items-center justify-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Room not found or expired</h1>
            <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
    );

    const questions = initialQuestions || [];

    // Check expiration locally for UI feedback
    const isExpired = room ? new Date(room.expires_at) < new Date() : false;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 p-4 shadow-sm">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold truncate max-w-[200px] md:max-w-md">{room?.title}</h1>
                        <p className="text-xs text-muted-foreground flex items-center space-x-2">
                            <span>Code: <span className="font-mono font-bold text-primary">{room?.code}</span></span>
                            {wsStatus === 'connecting' && <span className="text-yellow-500">• Connecting...</span>}
                            {wsStatus === 'disconnected' && <span className="text-destructive">• Offline</span>}
                        </p>
                    </div>
                    {isExpired && <Badge variant="destructive">Expired</Badge>}
                </div>
            </div>

            <div className="max-w-2xl mx-auto p-4 space-y-6">

                {/* Ask Box */}
                {!isExpired && (
                    <Card className="border-primary/20 shadow-sm">
                        <CardContent className="pt-6">
                            <form
                                onSubmit={(e) => {
                                    e.preventDefault();
                                    if (newQuestion.trim()) postMutation.mutate(newQuestion);
                                }}
                                className="flex gap-2"
                            >
                                <Input
                                    placeholder="Ask a question anonymously..."
                                    value={newQuestion}
                                    onChange={(e) => setNewQuestion(e.target.value)}
                                    className="flex-1"
                                    disabled={postMutation.isPending}
                                />
                                <Button type="submit" disabled={postMutation.isPending || !newQuestion.trim()}>
                                    Ask
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* Filters */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                        Questions <Badge variant="secondary">{questions.length}</Badge>
                    </h2>
                    <div className="flex bg-white rounded-md border p-1">
                        <button
                            onClick={() => setSortBy('top')}
                            className={cn(
                                "px-3 py-1 text-sm rounded-sm transition-colors",
                                sortBy === 'top' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-gray-100"
                            )}
                        >
                            Top
                        </button>
                        <button
                            onClick={() => setSortBy('latest')}
                            className={cn(
                                "px-3 py-1 text-sm rounded-sm transition-colors",
                                sortBy === 'latest' ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-gray-100"
                            )}
                        >
                            Latest
                        </button>
                    </div>
                </div>

                {/* Questions List */}
                <div className="space-y-4">
                    {questions.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground bg-white rounded-lg border border-dashed">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>No questions yet. Be the first to ask!</p>
                        </div>
                    ) : (
                        questions.map((q) => {
                            const hasVoted = votedQuestions.includes(q.id);
                            return (
                                <Card key={q.id} className={cn("transition-all", q.is_answered ? "bg-muted/30 border-l-4 border-l-green-500" : "")}>
                                    <CardContent className="p-4 flex gap-4">
                                        {/* Vote Button */}
                                        <div className="flex flex-col items-center gap-1">
                                            <button
                                                onClick={() => !isExpired && !hasVoted && voteMutation.mutate(q.id)}
                                                disabled={isExpired || hasVoted}
                                                className={cn(
                                                    "p-2 rounded-lg transition-colors flex flex-col items-center min-w-[3rem]",
                                                    hasVoted
                                                        ? "bg-primary text-white cursor-default"
                                                        : "hover:bg-secondary text-primary/70 hover:text-primary"
                                                )}
                                            >
                                                <ArrowUp className={cn("w-5 h-5", hasVoted && "text-white")} />
                                                <span className="text-sm font-bold">{q.votes}</span>
                                            </button>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 space-y-2">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className="text-base font-medium leading-relaxed">{q.content}</p>
                                                {q.is_answered && <Badge className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200 shrink-0">Answered</Badge>}
                                            </div>

                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Clock className="w-3 h-3" />
                                                {new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>

                                            {/* Organizer Reply */}
                                            {q.organizer_reply && (
                                                <div className="mt-3 bg-primary/5 p-3 rounded-md border border-primary/10 text-sm">
                                                    <p className="font-semibold text-primary mb-1 text-xs uppercase tracking-wide">Organizer Reply</p>
                                                    <p>{q.organizer_reply}</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
