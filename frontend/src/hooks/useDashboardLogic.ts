import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, fetcher } from '@/lib/api';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { Room, Question } from '@/types';

export function useDashboardLogic(code: string | undefined, token: string | undefined) {
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

    // Update 'now' every second
    useEffect(() => {
        const interval = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(interval);
    }, []);

    // Fetch Dashboard Data
    const { data, isLoading, error } = useQuery({
        queryKey: ['dashboard', code, token],
        queryFn: () => fetcher(`/api/organizer/${code}/${token}`),
        retry: false,
        enabled: !!code && !!token,
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
        if (lastMessage && code && token) {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    }, [lastMessage, queryClient, code, token]);

    // --- Mutations ---
    const replyMutation = useMutation({
        mutationFn: async ({ questionId, text }: { questionId: string, text: string }) => {
            await api.post(`/api/organizer/${code}/${token}/reply/${questionId}`, { reply_text: text });
        },
        onMutate: async ({ questionId, text }) => {
            setReplyingTo(null);
            setReplyText('');

            await queryClient.cancelQueries({ queryKey: ['dashboard', code, token] });
            const previousData = queryClient.getQueryData(['dashboard', code, token]);

            queryClient.setQueryData(['dashboard', code, token], (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    questions: old.questions.map((q: Question) =>
                        q.id === questionId
                            ? { ...q, organizer_reply: text, is_answered: true }
                            : q
                    )
                };
            });

            return { previousData };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['dashboard', code, token], context.previousData);
            }
            toast.error('Failed to send reply');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    });

    const markAnsweredMutation = useMutation({
        mutationFn: (questionId: string) => api.post(`/api/organizer/${code}/${token}/mark_answered/${questionId}`),
        onMutate: async (questionId) => {
            await queryClient.cancelQueries({ queryKey: ['dashboard', code, token] });
            const previousData = queryClient.getQueryData(['dashboard', code, token]);

            queryClient.setQueryData(['dashboard', code, token], (old: any) => {
                if (!old) return old;
                return {
                    ...old,
                    questions: old.questions.map((q: Question) =>
                        q.id === questionId ? { ...q, is_answered: true } : q
                    )
                };
            });

            return { previousData };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['dashboard', code, token], context.previousData);
            }
            toast.error('Failed to update status');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    });

    const sessionControlMutation = useMutation({
        mutationFn: async ({ action, minutes }: { action: 'start' | 'end' | 'extend', minutes?: number }) => {
            await api.post(`/api/rooms/${code}/${action}`, {}, {
                headers: { 'Authorization': `Bearer ${token}` },
                params: { token, minutes }
            });
        },
        onMutate: async ({ action, minutes }) => {
            setShowExtendModal(false);

            await queryClient.cancelQueries({ queryKey: ['dashboard', code, token] });
            const previousData = queryClient.getQueryData(['dashboard', code, token]);

            queryClient.setQueryData(['dashboard', code, token], (old: any) => {
                if (!old) return old;
                let newRoom = { ...old.room };

                if (action === 'start') newRoom.status = 'LIVE';
                if (action === 'end') newRoom.status = 'ENDED';
                if (action === 'extend' && minutes) {
                    const currentExpiry = new Date(newRoom.expires_at).getTime();
                    newRoom.expires_at = new Date(currentExpiry + minutes * 60000).toISOString();
                }

                return { ...old, room: newRoom };
            });

            return { previousData };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousData) {
                queryClient.setQueryData(['dashboard', code, token], context.previousData);
            }
            toast.error('Failed to update session');
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['dashboard', code, token] });
        }
    });

    // --- Helpers ---
    const handleShareLink = async () => {
        if (!room) return;
        const joinUrl = `${window.location.origin}/r/${code}`;
        const shareData = {
            title: `Join Q&A: ${room.title}`,
            text: `Join the Q&A session for "${room.title}" on HushHour. Use code: ${room.code}`,
            url: joinUrl,
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
                toast.success('Opened share menu');
            } else {
                await navigator.clipboard.writeText(joinUrl);
                toast.success('Link copied (Native sharing not supported)');
            }
        } catch (err) {
            console.error('Error sharing:', err);
            await navigator.clipboard.writeText(joinUrl);
            toast.success('Link copied to clipboard');
        }
    };

    const handleShareQR = async () => {
        if (!qrCode || !room) return;
        const joinUrl = `${window.location.origin}/r/${code}`;

        try {
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
                const link = document.createElement('a');
                link.href = `data:image/png;base64,${qrCode}`;
                link.download = `hushhour-qr-${code}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                toast.success('QR Code downloaded');
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

    return {
        room,
        questions,
        qrCode,
        isLoading,
        error,
        activeTab,
        setActiveTab,
        sortBy,
        setSortBy,
        replyingTo,
        setReplyingTo,
        replyText,
        setReplyText,
        showProjectModal,
        setShowProjectModal,
        showExtendModal,
        setShowExtendModal,
        extendHours,
        setExtendHours,
        extendMinutes,
        setExtendMinutes,
        filteredQuestions,
        isExpired,
        isEnded,
        areControlsLocked,
        handleShareLink,
        handleShareQR,
        handleExtend,
        replyMutation,
        markAnsweredMutation,
        sessionControlMutation
    };
}
