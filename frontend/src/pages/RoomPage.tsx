import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, Clock, MessageSquare, ThumbsUp } from 'lucide-react';
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
        }
    }, [lastMessage, queryClient, room?.id]);

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
                queryClient.setQueryData<Question[]>(['questions', room?.id, sortBy], [optimisticQuestion, ...previousQuestions]);
            }

            return { previousQuestions };
        },
        onSuccess: () => {
            setNewQuestion('');
            toast.success('Question added!');
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

    if (roomLoading) return <div className="flex h-screen items-center justify-center">Loading Room...</div>;
    if (roomError) return (
        <div className="flex flex-col h-screen items-center justify-center space-y-4">
            <h1 className="text-2xl font-bold text-destructive">Room not found or expired</h1>
            <Button onClick={() => navigate('/')}>Go Home</Button>
        </div>
    );

    // Check if session is upcoming
    const now = new Date();
    const startsAt = room ? new Date(room.starts_at) : new Date();
    const isUpcoming = startsAt > now;

    if (isUpcoming) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <CardTitle className="text-2xl text-primary">Session Starting Soon</CardTitle>
                        <CardDescription>This session hasn't started yet.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="bg-primary/5 p-6 rounded-full w-24 h-24 mx-auto flex items-center justify-center">
                            <Clock className="w-10 h-10 text-primary" />
                        </div>
                        <div>
                            <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Starts At</p>
                            <p className="text-xl font-bold mt-1">
                                {startsAt.toLocaleDateString()} {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            You can join the waiting room. Questions will open when the session begins.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const questions = initialQuestions || [];
    const isExpired = room ? new Date(room.expires_at) < new Date() : false;

    return (
        <div className="min-h-screen bg-gray-50 pb-20 md:pb-8">
            {/* Header */}
            <div className="bg-white border-b sticky top-0 z-10 p-4 shadow-sm">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div>
                        <h1 className="text-xl font-bold truncate max-w-[200px] md:max-w-md">{room?.title}</h1>
                        <div className="text-xs text-muted-foreground flex items-center space-x-2">
                            <span>Code: <span className="font-mono font-bold text-primary">{room?.code}</span></span>
                            {wsStatus === 'connecting' && <span className="text-yellow-500">• Connecting...</span>}
                            {wsStatus === 'disconnected' && <span className="text-destructive">• Offline</span>}
                        </div>
                    </div>
                    <div className="flex flex-col items-end">
                        {isExpired && <Badge variant="destructive">Expired</Badge>}
                        <span className="text-xs text-muted-foreground mt-1">
                            Ends: {room ? new Date(room.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                    </div>
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
                    <h2 className="text-lg font-semibold">{questions.length} Questions</h2>
                    <div className="bg-gray-100 p-1 rounded-lg flex text-sm">
                        <button
                            onClick={() => setSortBy('top')}
                            className={cn("px-3 py-1 rounded-md transition-all", sortBy === 'top' ? "bg-white shadow-sm font-medium" : "text-gray-500 hover:text-gray-900")}
                        >
                            Top
                        </button>
                        <button
                            onClick={() => setSortBy('latest')}
                            className={cn("px-3 py-1 rounded-md transition-all", sortBy === 'latest' ? "bg-white shadow-sm font-medium" : "text-gray-500 hover:text-gray-900")}
                        >
                            Latest
                        </button>
                    </div>
                </div>

                {/* Questions List */}
                <div className="space-y-4">
                    {questions.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-20" />
                            <p>No questions yet. Be the first to ask!</p>
                        </div>
                    ) : (
                        questions.map((q) => {
                            const hasVoted = votedQuestions.includes(q.id);
                            return (
                                <Card key={q.id} className={cn("transition-all", q.is_answered ? "bg-gray-50/80 border-l-4 border-l-green-500" : "hover:border-primary/30")}>
                                    <CardContent className="pt-6">
                                        <div className="flex gap-4">
                                            <div className="flex flex-col items-center gap-1">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className={cn("h-auto py-2 px-2 flex flex-col gap-1 hover:bg-transparent", hasVoted ? "text-primary" : "text-muted-foreground")}
                                                    onClick={() => !hasVoted && !isExpired && voteMutation.mutate(q.id)}
                                                    disabled={hasVoted || isExpired || voteMutation.isPending}
                                                >
                                                    <ArrowUp className={cn("w-6 h-6", hasVoted && "fill-current")} />
                                                    <span className="font-bold text-lg">{q.votes}</span>
                                                </Button>
                                            </div>
                                            <div className="flex-1 space-y-2">
                                                <p className="text-base font-medium leading-relaxed">{q.content}</p>
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <span>{new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    {q.is_answered && (
                                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
                                                            Answered
                                                        </Badge>
                                                    )}
                                                </div>

                                                {/* Organizer Reply */}
                                                {q.organizer_reply && (
                                                    <div className="mt-3 bg-blue-50/50 p-3 rounded-md border border-blue-100 text-sm">
                                                        <p className="font-semibold text-blue-700 text-xs mb-1">Organizer Reply:</p>
                                                        <p className="text-gray-800">{q.organizer_reply}</p>
                                                    </div>
                                                )}
                                            </div>
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
