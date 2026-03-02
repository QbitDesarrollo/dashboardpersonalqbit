import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import * as api from '@/lib/apiClient';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, CheckCircle } from 'lucide-react';

interface FieldConfig {
  key: string;
  label: string;
  type: 'text' | 'email' | 'textarea';
  required?: boolean;
}

export default function PublicFormView() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<{ id: string; name: string; description?: string; fields_config: FieldConfig[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!slug) return;
    api.getPublicForm(slug)
      .then(setForm)
      .catch(() => toast.error('Formulario no encontrado'))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !form) return;
    setSubmitting(true);
    try {
      await api.submitPublicForm(slug, values);
      setSubmitted(true);
      setValues({});
    } catch {
      toast.error('Error al enviar');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <p className="text-muted-foreground">Formulario no encontrado</p>
      </div>
    );
  }

  const defaultFields: FieldConfig[] = [
    { key: 'nombre', label: 'Nombre', type: 'text', required: true },
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'mensaje', label: 'Mensaje', type: 'textarea', required: true },
  ];
  const fields: FieldConfig[] = Array.isArray(form.fields_config) && form.fields_config.length > 0
    ? form.fields_config
    : defaultFields;

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Enviado correctamente</h2>
            <p className="text-muted-foreground">Gracias por tu mensaje.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="pt-6">
          <h1 className="text-2xl font-bold mb-2">{form.name}</h1>
          {form.description && <p className="text-muted-foreground mb-6">{form.description}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {fields.map((f) => (
              <div key={f.key}>
                <Label htmlFor={f.key}>{f.label}{f.required && ' *'}</Label>
                {f.type === 'textarea' ? (
                  <Textarea
                    id={f.key}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    required={f.required}
                    className="mt-1"
                  />
                ) : (
                  <Input
                    id={f.key}
                    type={f.type}
                    value={values[f.key] ?? ''}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                    required={f.required}
                    className="mt-1"
                  />
                )}
              </div>
            ))}
            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Enviar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
