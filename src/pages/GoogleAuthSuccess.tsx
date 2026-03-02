import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3003');

export default function GoogleAuthSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');

    if (!code) {
      toast.error('Error al iniciar sesión con Google');
      navigate('/login', { replace: true });
      return;
    }

    fetch(`${API_URL}/api/auth/google/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.token) {
          localStorage.setItem('tiusdei_token', data.token);
          toast.success('Sesión iniciada con Google');
          window.location.href = '/dashboard';
        } else {
          throw new Error('No token received');
        }
      })
      .catch(() => {
        toast.error('Error al iniciar sesión con Google');
        navigate('/login', { replace: true });
      });
  }, [searchParams, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-muted-foreground">Conectando con Google...</p>
      </div>
    </div>
  );
}
