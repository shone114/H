import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { api, fetcher } from '@/lib/api';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { Room, Question } from '@/types';

export function useRoomLogic(code: string | undefined) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [sortBy, setSortBy] = useState<'top' | 'latest' | 'answered'>('top');
    const [newQuestion, setNewQuestion] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // --- Local State / User ID Logic ---
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

    const [myQuestionIds, setMyQuestionIds] = useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(`my_questions_${code}`);
            return stored ? JSON.parse(stored) : [];
        } catch {
            return [];
        }
    });

    // --- Queries ---
    const { data: room, isLoading: roomLoading, error: roomError } = useQuery<Room>({
        queryKey: ['room', code],
        queryFn: () => fetcher(`/api/rooms/${code}`),
        retry: false,
        enabled: !!code,
    });

    const { data: initialQuestions } = useQuery<Question[]>({
        queryKey: ['questions', room?.id, sortBy],
        queryFn: () => fetcher(`/api/rooms/${code}/questions?sort=${sortBy}`),
        enabled: !!room?.id,
    });

    // --- Real-time Updates ---
    const { lastMessage } = useRoomSocket(room?.id);

    useEffect(() => {
        if (lastMessage && room?.id && code) {
            if (lastMessage.type === 'ROOM_STATUS_UPDATE' || lastMessage.type === 'ROOM_EXTENDED') {
                queryClient.invalidateQueries({ queryKey: ['room', code] });
            }
            queryClient.invalidateQueries({ queryKey: ['questions', room.id] });
        }
    }, [lastMessage, queryClient, room?.id, code]);

    // Scroll to bottom on 'latest'
    useEffect(() => {
        if (sortBy === 'latest') {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [sortBy]);

    // --- Mutations ---
    const postMutation = useMutation({
        mutationFn: (content: string) => api.post(`/api/rooms/${code}/questions`, { content, voter_id: voterId }),
        onMutate: async (content) => {
            setNewQuestion('');

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
                    ? [...previousQuestions, optimisticQuestion]
                    : [optimisticQuestion, ...previousQuestions];
                queryClient.setQueryData<Question[]>(['questions', room?.id, sortBy], newData);
            }

            // Optimistic "My Question" Glow
            setMyQuestionIds(prev => [...prev, optimisticQuestion.id]);

            if (sortBy === 'latest') {
                setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 10);
            }

            return { previousQuestions, optimisticId: optimisticQuestion.id };
        },
        onSuccess: (newQ, _variables, context) => {
            if (newQ && newQ.data && newQ.data.id) {
                setMyQuestionIds(prev => {
                    const filtered = prev.filter(id => id !== context.optimisticId);
                    const newIds = [...filtered, newQ.data.id];
                    localStorage.setItem(`my_questions_${code}`, JSON.stringify(newIds));
                    return newIds;
                });

                // Update Cache with Real ID silently
                queryClient.setQueryData<Question[]>(['questions', room?.id, sortBy], (old) => {
                    if (!old) return old as Question[];
                    return (old as Question[]).map(q => q.id === context.optimisticId ? newQ.data : q);
                });
            }
        },
        onError: (_err, _vars, context) => {
            if (context?.previousQuestions) {
                queryClient.setQueryData(['questions', room?.id, sortBy], context.previousQuestions);
            }
            toast.error("Failed to post question");
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
        }
    });

    // --- Sorting Logic ---
    const sortedQuestions = (initialQuestions || []).filter(q => {
        if (sortBy === 'answered') return q.is_answered;
        return true;
    }).sort((a, b) => {
        if (sortBy === 'top' || sortBy === 'answered') {
            if (sortBy === 'top' && a.is_answered !== b.is_answered) return a.is_answered ? 1 : -1;
            return b.votes - a.votes;
        }
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return {
        room,
        roomLoading,
        roomError,
        questions: sortedQuestions,
        sortBy,
        setSortBy,
        newQuestion,
        setNewQuestion,
        postQuestion: postMutation.mutate,
        isPosting: postMutation.isPending,
        voteQuestion: voteMutation.mutate,
        isVoting: voteMutation.isPending,
        votedQuestions,
        myQuestionIds,
        messagesEndRef,
        navigate
    };
}
