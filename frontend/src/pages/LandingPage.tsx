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
    const [duration, setDuration] = useState(6);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState('');

    // ... join handler ...

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!createTitle.trim()) return;

        setIsCreating(true);
        setError('');
        try {
            const res = await api.post('/api/rooms/', {
                title: createTitle,
                expires_hours: duration
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

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-muted-foreground">Duration</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {[1, 6, 12, 24].map((hrs) => (
                                        <button
                                            key={hrs}
                                            type="button"
                                            onClick={() => setDuration(hrs)}
                                            className={`
                                                py-2 rounded-md text-sm font-medium transition-all
                                                ${duration === hrs
                                                    ? 'bg-primary text-white shadow-md'
                                                    : 'bg-white text-gray-600 border hover:border-primary/50'}
                                            `}
                                        >
                                            {hrs}h
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <Button type="submit" className="w-full" size="lg" disabled={isCreating || !createTitle.trim()}>
                                {isCreating ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                                {isCreating ? 'Creating...' : 'Create Room'}
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
