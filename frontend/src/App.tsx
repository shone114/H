import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LandingPage from './pages/LandingPage';
import RoomPage from './pages/RoomPage';
import DashboardPage from './pages/DashboardPage';
import { Toaster } from 'sonner';

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/r/:code" element={<RoomPage />} />
          <Route path="/dashboard/:code/:token" element={<DashboardPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster position="top-center" richColors />
      </Router>
    </QueryClientProvider>
  );
}

export default App;
