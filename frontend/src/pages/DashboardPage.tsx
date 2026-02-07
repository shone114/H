import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { api, fetcher } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { ArrowUp, Share2, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
    expires_at: string;
    qr_code?: string;
}

export default function DashboardPage() {
    const { code, token } = useParams<{ code: string; token: string }>();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'unanswered' | 'answered'>('unanswered');
    const [sortBy, setSortBy] = useState<'top' | 'latest'>('top');
    const [replyingTo, setReplyingTo] = useState<Question | null>(null);
    const [replyText, setReplyText] = useState('');

    // Fetch Dashboard Data
    const { data, isLoading, error } = useQuery({
        queryKey: ['dashboard', code, token],
        queryFn: () => fetcher(`/api/organizer/${code}/${token}`),
        retry: false,
    });

    const room = data?.room as Room;
    const questions = (data?.questions || []) as Question[];
    const qrCode = data?.qr_code as string;

    // Real-time Updates
    const { lastMessage } = useRoomSocket(room?.id);

    useEffect(() => {
        if (lastMessage) {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    }, [lastMessage, queryClient, code, token]);

    // Mutations
    const replyMutation = useMutation({
        mutationFn: async () => {
            if (!replyingTo) return;
            await api.post(`/api/organizer/${code}/${token}/reply/${replyingTo.id}`, { reply_text: replyText });
        },
        onSuccess: () => {
            setReplyingTo(null);
            setReplyText('');
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
            toast.success('Reply sent!');
        }
    });

    const markAnsweredMutation = useMutation({
        mutationFn: (questionId: string) => api.post(`/api/organizer/${code}/${token}/mark_answered/${questionId}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
            toast.success('Marked as answered');
        }
    });

    if (isLoading) return <div className="flex h-screen items-center justify-center">Loading Dashboard...</div>;
    if (error) return <div className="flex h-screen items-center justify-center text-destructive">Access Denied or Room Not Found</div>;

    const sortedQuestions = [...questions].sort((a, b) => {
        if (sortBy === 'top') {
            if (b.votes !== a.votes) return b.votes - a.votes;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    const filteredQuestions = sortedQuestions.filter(q =>
        activeTab === 'answered' ? q.is_answered : !q.is_answered
    );

    const joinUrl = `${window.location.origin}/r/${code}`;

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col md:flex-row">
            {/* Sidebar / Header */}
            <aside className="bg-white border-b md:border-r w-full md:w-80 p-6 flex flex-col gap-6 shrink-0">
                <div>
                    <h1 className="text-2xl font-bold text-primary mb-1">HushHour</h1>
                    <p className="text-sm text-muted-foreground">Organizer Dashboard</p>
                </div>

                <div className="bg-primary/5 p-4 rounded-lg border border-primary/10 space-y-3">
                    <div>
                        <p className="text-xs uppercase text-muted-foreground font-semibold">Room</p>
                        <p className="font-bold text-lg leading-tight mt-1">{room.title}</p>
                    </div>
                    <div>
                        <p className="text-xs uppercase text-muted-foreground font-semibold">Code</p>
                        <p className="font-mono text-3xl font-bold tracking-widest text-primary mt-1">{room.code}</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="w-full bg-white"
                        onClick={() => {
                            navigator.clipboard.writeText(joinUrl);
                            toast.success('Link copied to clipboard');
                        }}
                    >
                        <Share2 className="w-4 h-4 mr-2" /> Copy Link
                    </Button>
                </div>

                <div className="bg-white p-4 rounded-lg border flex flex-col items-center text-center">
                    <p className="text-sm font-medium mb-2">Audience Scan</p>
                    {qrCode ? (
                        <img
                            src={`data:image/png;base64,${qrCode}`}
                            alt="Room QR Code"
                            className="w-32 h-32"
                        />
                    ) : (
                        <div className="bg-gray-200 w-32 h-32 rounded-md flex items-center justify-center text-xs text-muted-foreground">
                            No QR Code
                        </div>
                    )}
                </div>

                <div className="mt-auto pt-4 border-t text-xs text-muted-foreground">
                    <p>Expires: {new Date(room.expires_at).toLocaleString()}</p>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden h-screen">
                <header className="bg-white border-b p-4 flex items-center gap-4">
                    <Button
                        variant={activeTab === 'unanswered' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('unanswered')}
                    >
                        In Queue ({questions.filter(q => !q.is_answered).length})
                    </Button>
                    <Button
                        variant={activeTab === 'answered' ? 'default' : 'ghost'}
                        onClick={() => setActiveTab('answered')}
                    >
                        Answered ({questions.filter(q => q.is_answered).length})
                    </Button>

                    <div className="ml-auto flex bg-gray-100 rounded-md p-1">
                        <button
                            onClick={() => setSortBy('top')}
                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${sortBy === 'top' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                        >
                            Top
                        </button>
                        <button
                            onClick={() => setSortBy('latest')}
                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${sortBy === 'latest' ? 'bg-white shadow-sm text-primary' : 'text-muted-foreground hover:text-gray-900'}`}
                        >
                            Latest
                        </button>
                    </div>

                </header>

                <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
                    {filteredQuestions.length === 0 ? (
                        <div className="flex items-center justify-center h-40 text-muted-foreground">
                            <p>No {activeTab} questions found.</p>
                        </div>
                    ) : (
                        filteredQuestions.map(q => (
                            <Card key={q.id} className="hover:shadow-md transition-shadow">
                                <CardContent className="p-6 flex gap-4">
                                    <div className="flex flex-col items-center min-w-[3rem] text-primary">
                                        <ArrowUp className="w-5 h-5 mb-1" />
                                        <span className="font-bold text-lg">{q.votes}</span>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        <p className="text-lg font-medium">{q.content}</p>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span>{new Date(q.created_at).toLocaleTimeString()}</span>
                                        </div>
                                        {q.organizer_reply && (
                                            <div className="mt-2 text-sm bg-blue-50/50 p-2 rounded border border-blue-100">
                                                <span className="font-semibold text-blue-700 text-xs">Your Reply: </span>
                                                <span className="text-gray-700">{q.organizer_reply}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        {!q.is_answered && (
                                            <>
                                                <Button size="sm" onClick={() => setReplyingTo(q)}>
                                                    Reply
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => markAnsweredMutation.mutate(q.id)}
                                                    title="Mark as done without reply"
                                                >
                                                    <CheckCircle className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                        {q.is_answered && (
                                            <Badge variant="secondary" className="justify-center">Done</Badge>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            </main >

            {/* Reply Modal */}
            < Modal
                isOpen={!!replyingTo
                }
                onClose={() => setReplyingTo(null)}
                title="Reply to Question"
            >
                <div className="space-y-4">
                    <div className="bg-muted p-3 rounded-md text-sm italic">
                        "{replyingTo?.content}"
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Your Reply</label>
                        <Input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type your answer..."
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="ghost" onClick={() => setReplyingTo(null)}>Cancel</Button>
                        <Button
                            onClick={() => replyMutation.mutate()}
                            disabled={replyMutation.isPending || !replyText.trim()}
                        >
                            {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                        </Button>
                    </div>
                </div>
            </Modal >
        </div >
    );
}