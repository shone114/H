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
import { Label } from '@/components/ui/label';
import {
    ArrowUp,
    Share2,
    CheckCircle2,
    Clock,
    MoreVertical,
    Users,
    Maximize2,
    PlayCircle,
    StopCircle,
    PlusCircle,
    Archive,
    Download
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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
    status: 'WAITING' | 'LIVE' | 'ENDED';
}

export default function DashboardPage() {
    const { code, token } = useParams<{ code: string; token: string }>();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'unanswered' | 'answered'>('unanswered');
    const [sortBy, setSortBy] = useState<'top' | 'latest'>('top');

    // UI States
    const [replyingTo, setReplyingTo] = useState<Question | null>(null);
    const [replyText, setReplyText] = useState('');
    const [showProjectModal, setShowProjectModal] = useState(false);
    const [showExtendModal, setShowExtendModal] = useState(false);
    const [extendHours, setExtendHours] = useState('0');
    const [extendMinutes, setExtendMinutes] = useState('15');

    const [now, setNow] = useState(new Date());

    // Update 'now' every second to check for expiration in real-time
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Fetch Dashboard Data
    const { data, isLoading, error } = useQuery({
        queryKey: ['dashboard', code, token],
        queryFn: () => fetcher(`/api/organizer/${code}/${token}`),
        retry: false,
    });

    const room = data?.room as Room;
    const questions = (data?.questions || []) as Question[];
    const qrCode = data?.qr_code as string;

    const isExpired = room ? new Date(room.expires_at) < now : false;
    const isEnded = room?.status === 'ENDED';
    const areControlsLocked = isEnded || isExpired;

    // Real-time Updates
    const { lastMessage } = useRoomSocket(room?.id);

    useEffect(() => {
        if (lastMessage) {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    }, [lastMessage, queryClient, code, token]);

    // --- Mutations ---

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

    const sessionControlMutation = useMutation({
        mutationFn: async ({ action, minutes }: { action: 'start' | 'end' | 'extend', minutes?: number }) => {
            await api.post(`/api/rooms/${code}/${action}`, {}, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { token, minutes }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
            setShowExtendModal(false);
            toast.success('Session status updated');
        }
    });

    // --- Helpers ---

    const handleShareLink = async () => {
        const joinUrl = `${window.location.origin}/r/${code}`;
        const shareData = {
            title: `Join my HushHour Session: ${room.title}`,
            text: `Ask me anything! Join the live Q&A session for "${room.title}" using code ${room.code}.`,
            url: joinUrl,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
                toast.success('Opened share menu');
            } else {
                await navigator.clipboard.writeText(joinUrl);
                toast.success('Link copied to clipboard (Native sharing not supported)');
            }
        } catch (err) {
            console.error('Error sharing:', err);
            // Verify persistence of copy fallback
            await navigator.clipboard.writeText(joinUrl);
            toast.success('Link copied to clipboard');
        }
    };

    const handleShareQR = async () => {
        if (!qrCode) return;
        const joinUrl = `${window.location.origin}/r/${code}`;

        try {
            // Convert Base64 to Blob
            const byteCharacters = atob(qrCode);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
                byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: 'image/png' });
            const file = new File([blob], `hushhour-qr-${code}.png`, { type: 'image/png' });

            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: `Join ${room.title}`,
                    text: `Scan to join the Q&A session! or visit ${joinUrl}`,
                });
                toast.success('Opened QR share menu');
            } else {
                // Fallback: Download
                const link = document.createElement('a');
                link.href = `data:image/png;base64,${qrCode}`;
                link.download = `hushhour-qr-${code}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('QR Code downloaded (Native sharing not supported)');
            }
        } catch (err) {
            console.error('Error sharing QR:', err);
            toast.error('Failed to share QR code');
        }
    };

    const handleExtend = () => {
        const h = parseInt(extendHours);
        const m = parseInt(extendMinutes);
        const totalMinutes = h * 60 + m;
        if (totalMinutes > 0) {
            sessionControlMutation.mutate({ action: 'extend', minutes: totalMinutes });
        }
    };


    if (isLoading) return <div className="flex h-screen items-center justify-center bg-soft-charcoal text-gentle-grey">Loading Dashboard...</div>;
    if (error) return <div className="flex h-screen items-center justify-center bg-soft-charcoal text-red-400">Access Denied or Room Not Found</div>;

    const sortedQuestions = [...questions].sort((a, b) => {
        if (sortBy === 'top') {
            if (b.votes !== a.votes) return b.votes - a.votes;
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Tie-break with time
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); // Latest
    });

    const filteredQuestions = sortedQuestions.filter(q =>
        activeTab === 'answered' ? q.is_answered : !q.is_answered
    );

    return (
        <div className="flex flex-col h-[100dvh] bg-soft-charcoal text-soft-white font-sans selection:bg-washed-blue/30 selection:text-soft-white">

            {/* --- Header & Action Bar --- */}
            <header className="flex-none z-50 bg-soft-charcoal border-b border-soft-border shadow-sm">
                <div className="w-full max-w-7xl mx-auto px-4 md:px-6 py-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

                        {/* Info & Status */}
                        <div className="flex items-center gap-4">
                            <div className="hidden md:flex bg-ink-grey h-12 w-12 rounded-xl items-center justify-center border border-soft-border text-soft-indigo shadow-sm">
                                <Users className="w-6 h-6" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h1 className="text-xl font-bold text-soft-white leading-none">{room.title}</h1>
                                    <Badge variant="outline" className="font-mono text-[10px] text-gentle-grey border-soft-border bg-ink-grey/50 tracking-wider">
                                        {room.code}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs font-medium">
                                    {room.status === 'WAITING' && <span className="text-yellow-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />Waiting for Host</span>}
                                    {room.status === 'LIVE' && <span className="text-green-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />LIVE NOW</span>}
                                    {room.status === 'ENDED' && <span className="text-red-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-red-400" />Session Ended</span>}

                                    <span className="text-soft-border">|</span>

                                    <span className={cn("flex items-center gap-1.5", isExpired && !isEnded ? "text-red-400" : "text-gentle-grey")}>
                                        <Clock className="w-3.5 h-3.5" />
                                        {new Date(room.expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Primary Actions */}
                        <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0">

                            {/* Present & Share */}
                            <div className="flex items-center bg-ink-grey p-1 rounded-lg border border-soft-border mr-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-gentle-grey hover:text-soft-white hover:bg-soft-border h-8 gap-2"
                                    onClick={() => setShowProjectModal(true)}
                                >
                                    <Maximize2 className="w-4 h-4" /> <span className="hidden sm:inline">Show QR</span>
                                </Button>
                                <div className="w-px h-4 bg-soft-border mx-1"></div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-gentle-grey hover:text-soft-white hover:bg-soft-border h-8 gap-2"
                                    onClick={handleShareLink}
                                >
                                    <Share2 className="w-4 h-4" /> <span className="hidden sm:inline">Share</span>
                                </Button>
                            </div>

                            {/* Session State Controls */}
                            {room.status === 'WAITING' && (
                                <Button
                                    className="bg-green-500 hover:bg-green-600 text-white shadow-[0_0_15px_-3px_rgba(34,197,94,0.4)] border border-green-400/20 font-bold tracking-wide"
                                    onClick={() => sessionControlMutation.mutate({ action: 'start' })}
                                    disabled={sessionControlMutation.isPending}
                                >
                                    <PlayCircle className="w-4 h-4 mr-2" /> GO LIVE
                                </Button>
                            )}

                            {room.status === 'LIVE' && (
                                <>
                                    <Button
                                        variant="outline"
                                        className="bg-transparent text-soft-white border-soft-border hover:bg-soft-border"
                                        onClick={() => setShowExtendModal(true)}
                                        disabled={sessionControlMutation.isPending}
                                    >
                                        <PlusCircle className="w-4 h-4 mr-2" /> Extend
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        className="bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 shadow-none"
                                        onClick={() => sessionControlMutation.mutate({ action: 'end' })}
                                        disabled={sessionControlMutation.isPending}
                                    >
                                        <StopCircle className="w-4 h-4 mr-2" /> End
                                    </Button>
                                </>
                            )}
                            {/* Re-open option? Currently logic doesn't support easy re-open from ENDED without DB start, but let's stick to plan. */}
                            {room.status === 'ENDED' && (
                                <Badge variant="outline" className="h-9 px-4 border-red-500/30 text-red-400 bg-red-500/5">
                                    Finished
                                </Badge>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* --- Main Content --- */}
            <main className="flex-1 overflow-hidden relative">
                <div className="absolute inset-0 flex flex-col md:flex-row max-w-7xl mx-auto w-full">

                    {/* Questions Feed */}
                    <div className="flex-1 flex flex-col min-w-0 border-r border-soft-border/50 bg-soft-charcoal">

                        {/* Feed Controls */}
                        <div className="flex-none p-4 border-b border-soft-border/50 flex items-center justify-between sticky top-0 bg-soft-charcoal/95 backdrop-blur-sm z-10">
                            <div className="flex gap-2">
                                <Button
                                    variant={activeTab === 'unanswered' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setActiveTab('unanswered')}
                                    className={cn("rounded-full", activeTab === 'unanswered' ? "bg-soft-indigo/20 text-soft-indigo hover:bg-soft-indigo/30" : "text-gentle-grey hover:text-soft-white")}
                                >
                                    In Queue <Badge className="ml-2 bg-soft-charcoal/50 text-inherit border-0">{questions.filter(q => !q.is_answered).length}</Badge>
                                </Button>
                                <Button
                                    variant={activeTab === 'answered' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setActiveTab('answered')}
                                    className={cn("rounded-full", activeTab === 'answered' ? "bg-muted-mint/20 text-muted-mint hover:bg-muted-mint/30" : "text-gentle-grey hover:text-soft-white")}
                                >
                                    Answered <Badge className="ml-2 bg-soft-charcoal/50 text-inherit border-0">{questions.filter(q => q.is_answered).length}</Badge>
                                </Button>
                            </div>

                            <div className="flex bg-ink-grey rounded-lg p-0.5 border border-soft-border">
                                <button
                                    onClick={() => setSortBy('top')}
                                    className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", sortBy === 'top' ? "bg-soft-border text-soft-white shadow-sm" : "text-gentle-grey hover:text-soft-white")}
                                >
                                    Top
                                </button>
                                <button
                                    onClick={() => setSortBy('latest')}
                                    className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", sortBy === 'latest' ? "bg-soft-border text-soft-white shadow-sm" : "text-gentle-grey hover:text-soft-white")}
                                >
                                    Newest
                                </button>
                            </div>
                        </div>

                        {/* Scroll Area */}
                        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
                            {filteredQuestions.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 text-center">
                                    <div className="w-16 h-16 rounded-full bg-ink-grey flex items-center justify-center mb-4 border border-soft-border text-gentle-grey">
                                        <Archive className="w-8 h-8 opacity-50" />
                                    </div>
                                    <p className="text-soft-white font-medium">No questions here yet.</p>
                                    <p className="text-xs text-gentle-grey mt-1">Wait for the audience to join!</p>
                                </div>
                            ) : (
                                filteredQuestions.map(q => (
                                    <Card key={q.id} className={cn(
                                        "transition-all border-soft-border bg-ink-grey shadow-sm group",
                                        q.is_answered ? "border-muted-mint/20 bg-muted-mint/5" : "hover:border-soft-border/80"
                                    )}>
                                        <CardContent className="p-5 flex gap-5">
                                            {/* Vote Count */}
                                            <div className="flex flex-col items-center min-w-[3rem] pt-1">
                                                <div className={cn("text-2xl font-bold leading-none", q.is_answered ? "text-muted-mint" : "text-soft-indigo")}>
                                                    {q.votes}
                                                </div>
                                                <div className="text-[10px] text-muted-text uppercase tracking-wider font-bold mt-1">
                                                    Votes
                                                </div>
                                            </div>

                                            {/* Content */}
                                            <div className="flex-1 min-w-0 space-y-3">
                                                <p className="text-lg text-soft-white font-medium leading-relaxed">{q.content}</p>

                                                <div className="flex items-center gap-3 text-xs text-muted-text font-medium">
                                                    <span>{new Date(q.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                    {q.is_answered && <span className="flex items-center text-muted-mint"><CheckCircle2 className="w-3 h-3 mr-1" /> Answered</span>}
                                                </div>

                                                {/* Reply Display */}
                                                {q.organizer_reply && (
                                                    <div className="mt-3 bg-soft-charcoal/50 border border-border/50 rounded-xl p-3.5 relative">
                                                        <div className="absolute top-0 left-0 w-1 h-full bg-soft-indigo/50 rounded-l-xl"></div>
                                                        <p className="text-xs font-bold text-soft-indigo mb-1 uppercase tracking-wide">Your Reply</p>
                                                        <p className="text-sm text-gentle-grey leading-relaxed">{q.organizer_reply}</p>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Action Buttons */}
                                            <div className="flex flex-col gap-2 pt-1">
                                                {!q.is_answered && (
                                                    <>
                                                        <Button
                                                            size="sm"
                                                            className="bg-soft-indigo text-white hover:bg-soft-indigo/90 shadow-sm"
                                                            onClick={() => setReplyingTo(q)}
                                                            disabled={areControlsLocked}
                                                            title={areControlsLocked ? "Session locked" : "Reply to question"}
                                                        >
                                                            Reply
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            className="border-soft-border text-gentle-grey hover:text-soft-white hover:bg-soft-border"
                                                            onClick={() => markAnsweredMutation.mutate(q.id)}
                                                            disabled={areControlsLocked}
                                                            title={areControlsLocked ? "Session locked" : "Mark as done"}
                                                        >
                                                            <CheckCircle2 className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* --- Modals --- */}

            {/* Reply Modal */}
            <Modal
                isOpen={!!replyingTo}
                onClose={() => setReplyingTo(null)}
                title="Reply to Question"
            >
                <div className="space-y-6">
                    <div className="bg-ink-grey p-4 rounded-xl border border-soft-border text-soft-white">
                        <p className="text-lg font-medium">"{replyingTo?.content}"</p>
                    </div>
                    <div className="space-y-3">
                        <Label htmlFor="reply" className="text-sm font-medium text-gentle-grey">Your Answer</Label>
                        <Input
                            id="reply"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Type your answer here..."
                            className="bg-ink-grey border-soft-border text-soft-white focus:border-soft-indigo focus:ring-soft-indigo/20 h-24 pb-16 resize-none" // Styled as textarea-ish
                            autoFocus
                        />
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setReplyingTo(null)} className="text-gentle-grey hover:text-soft-white">Cancel</Button>
                        <Button
                            onClick={() => replyMutation.mutate()}
                            disabled={replyMutation.isPending || !replyText.trim()}
                            className="bg-soft-indigo hover:bg-soft-indigo/90 text-white"
                        >
                            {replyMutation.isPending ? 'Sending...' : 'Send Reply'}
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Extend Session Modal */}
            <Modal
                isOpen={showExtendModal}
                onClose={() => setShowExtendModal(false)}
                title="Extend Session Time"
            >
                <div className="space-y-6">
                    <div className="space-y-4">
                        <p className="text-sm text-gentle-grey">Choose how much time you want to add to the session expiry.</p>
                        <div className="flex items-center gap-4">
                            <div className="flex-1 space-y-2">
                                <Label className="text-xs text-muted-text uppercase font-bold">Hours</Label>
                                <div className="bg-ink-grey rounded-lg border border-soft-border px-3 py-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="24"
                                        value={extendHours}
                                        onChange={(e) => setExtendHours(e.target.value)}
                                        className="bg-transparent text-xl font-bold text-soft-white w-full focus:outline-none"
                                    />
                                </div>
                            </div>
                            <div className="text-2xl font-bold text-soft-border pt-6">:</div>
                            <div className="flex-1 space-y-2">
                                <Label className="text-xs text-muted-text uppercase font-bold">Minutes</Label>
                                <div className="bg-ink-grey rounded-lg border border-soft-border px-3 py-2">
                                    <input
                                        type="number"
                                        min="0"
                                        max="59"
                                        value={extendMinutes}
                                        onChange={(e) => setExtendMinutes(e.target.value)}
                                        className="bg-transparent text-xl font-bold text-soft-white w-full focus:outline-none"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button variant="ghost" onClick={() => setShowExtendModal(false)} className="text-gentle-grey hover:text-soft-white">Cancel</Button>
                        <Button
                            onClick={handleExtend}
                            disabled={sessionControlMutation.isPending}
                            className="bg-soft-indigo hover:bg-soft-indigo/90 text-white"
                        >
                            {sessionControlMutation.isPending ? 'Extending...' : 'Confirm Extension'}
                        </Button>
                    </div>
                </div>
            </Modal>


            {/* Project/QR Modal */}
            {showProjectModal && (
                <div className="fixed inset-0 z-[60] bg-soft-charcoal flex flex-col items-center justify-center animate-in fade-in duration-300">
                    <button
                        onClick={() => setShowProjectModal(false)}
                        className="absolute top-6 right-6 p-2 bg-ink-grey rounded-full text-gentle-grey hover:text-white"
                    >
                        <MinimizeIcon className="w-6 h-6" />
                    </button>

                    <div className="text-center space-y-8 animate-in zoom-in-95 duration-500">
                        <h2 className="text-3xl md:text-5xl font-bold text-soft-white tracking-tight">{room.title}</h2>

                        <div className="relative group perspective-1000">
                            <div className="absolute inset-0 bg-soft-indigo/20 blur-3xl rounded-full animate-pulse group-hover:bg-soft-indigo/30 transition-all"></div>
                            {qrCode && (
                                <img
                                    src={`data:image/png;base64,${qrCode}`}
                                    alt="Room QR Code"
                                    className="relative w-64 h-64 md:w-96 md:h-96 rounded-3xl border-4 border-soft-white shadow-2xl transition-transform transform group-hover:scale-105"
                                />
                            )}
                        </div>

                        <div className="space-y-4">
                            <p className="text-xl md:text-2xl text-gentle-grey font-medium">Scan to join or visit</p>
                            <div className="inline-block bg-ink-grey px-8 py-4 rounded-full border border-soft-border shadow-lg">
                                <span className="text-2xl md:text-3xl font-mono font-bold text-soft-indigo tracking-wider">hushhour.app/r/{room.code}</span>
                            </div>
                        </div>

                        <div className="pt-8 flex justify-center gap-4">
                            <Button
                                variant="outline"
                                className="border-soft-border text-soft-white hover:bg-soft-border h-12 px-6 rounded-full gap-2"
                                onClick={handleShareQR}
                            >
                                <Share2 className="w-5 h-5" /> Share QR Image
                            </Button>
                            <Button
                                variant="outline"
                                className="border-soft-border text-soft-white hover:bg-soft-border h-12 px-6 rounded-full gap-2"
                                onClick={() => {
                                    const link = document.createElement('a');
                                    link.href = `data:image/png;base64,${qrCode}`;
                                    link.download = `hushhour-qr-${code}.png`;
                                    link.click();
                                }}
                            >
                                <Download className="w-5 h-5" /> Download
                            </Button>
                        </div>

                    </div>

                    <div className="absolute bottom-8 text-muted-text text-sm">
                        Press ESC or click close to return to dashboard
                    </div>
                </div>
            )}
        </div>
    );
}

function MinimizeIcon({ className }: { className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <path d="M8 3v3a2 2 0 0 1-2 2H3" />
            <path d="M21 8h-3a2 2 0 0 1-2-2V3" />
            <path d="M3 16h3a2 2 0 0 1 2 2v3" />
            <path d="M16 21v-3a2 2 0 0 1 2-2h3" />
        </svg>
    )
}