import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { Loader2, ArrowRight } from 'lucide-react';

export default function LandingPage() {
    const navigate = useNavigate();
    const [joinCode, setJoinCode] = useState('');
    const [createTitle, setCreateTitle] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [expiresAt, setExpiresAt] = useState('');
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    // ... join handler ...

    const handleJoin = (e: React.FormEvent) => {
        e.preventDefault();
        if (joinCode.length < 6) {
            setError('Code must be at least 6 characters');
            return;
        }
        navigate(`/r/${joinCode.toUpperCase()}`);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createTitle.trim()) return;

        setIsCreating(true);
        setError('');
        try {
            // Convert local datetime to ISO strings
            const startISO = new Date(startsAt).toISOString();
            const endISO = new Date(expiresAt).toISOString();

            const res = await api.post('/api/rooms/', {
                title: createTitle,
                starts_at: startISO,
                expires_at: endISO
            });
            const { code, organizer_token } = res.data;
            navigate(`/dashboard/${code}/${organizer_token}`);
        } catch (err) {
            console.error(err);
            setError('Failed to create room. Please try again.');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="grid md:grid-cols-2 gap-8 w-full max-w-4xl">
                {/* Join Section */}
                <Card className="w-full">
                    {/* ... keep join section same ... */}
                    <CardHeader>
                        <CardTitle className="text-2xl">Join a Session</CardTitle>
                        <CardDescription>Enter the 6-character room code to join anonymously.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleJoin} className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    placeholder="Enter Room Code (e.g. A1B2C3)"
                                    value={joinCode}
                                    onChange={(e) => {
                                        setJoinCode(e.target.value.toUpperCase());
                                        setError('');
                                    }}
                                    maxLength={6}
                                    className="text-center text-lg tracking-widest uppercase"
                                />
                            </div>
                            <Button type="submit" className="w-full" size="lg" disabled={joinCode.length < 6}>
                                Join Room <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* Create Section */}
                <Card className="w-full border-primary/20 bg-primary/5">
                    <CardHeader>
                        <CardTitle className="text-2xl text-primary">Host a Session</CardTitle>
                        <CardDescription>Create a room for your event. No login required.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Input
                                    placeholder="Event Title (e.g. React Workshop)"
                                    value={createTitle}
                                    onChange={(e) => setCreateTitle(e.target.value)}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">Start Time</label>
                                    <Input
                                        type="datetime-local"
                                        value={startsAt}
                                        onChange={(e) => setStartsAt(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-muted-foreground">End Time</label>
                                    <Input
                                        type="datetime-local"
                                        value={expiresAt}
                                        onChange={(e) => setExpiresAt(e.target.value)}
                                        required
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                disabled={isCreating || !createTitle.trim() || !startsAt || !expiresAt}
                            >
                                Create Room <ArrowRight className="ml-2 w-4 h-4" />
                            </Button>
                            {error && <p className="text-sm text-destructive text-center">{error}</p>}
                        </form>
                    </CardContent>
                </Card>
            </div>

            <div className="absolute bottom-4 text-center w-full text-muted-foreground text-sm">
                Built with HushHour
            </div>
        </div>
    );
}
