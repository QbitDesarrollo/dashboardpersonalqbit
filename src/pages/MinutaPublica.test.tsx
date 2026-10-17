import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as api from '@/lib/minutaPublicaApi';
import { ErrorEnlace, type MinutaCliente } from '@/lib/minutaPublicaApi';
import MinutaPublica from './MinutaPublica';

vi.mock('@/lib/minutaPublicaApi', async (orig) => ({
  ...(await orig<typeof import('@/lib/minutaPublicaApi')>()),
  entrarCodigo: vi.fn(), entrarNombre: vi.fn(), verMinuta: vi.fn(), aprobarPunto: vi.fn(), pedirAjustePunto: vi.fn(), comentarPunto: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const m = vi.mocked(api);
const TOKEN = 'tok123';

const minuta = (estado: 'completado' | 'aprobado' = 'completado', notas: MinutaCliente['items'][number]['notas'] = []): MinutaCliente => ({
  id: 'm1', numero: 1, codigo: 'M-01', titulo: 'Seguimiento semanal', fecha: '2026-09-24', resumen: 'Acuerdos de la semana',
  brand_nombre: 'Alba del Bosque', project_nombre: null, visitante: 'Antonio Pérez',
  items: [{
    id: 'i1', numero: 1, titulo: 'Panel de alertas', descripcion: 'Revisar alertas', estado, visible_cliente: true, responsable_cliente: false,
    fecha_compromiso: null, resolucion: 'Quedó listo', evidencias: [], notas,
  }],
});

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  m.entrarCodigo.mockResolvedValue({ titulo: 'Seguimiento semanal', marca: 'Alba del Bosque', nombres: ['Antonio Pérez', 'María León'] });
  m.entrarNombre.mockResolvedValue('sesion-1');
  m.verMinuta.mockResolvedValue(minuta());
});

const abrir = () => render(
  <MemoryRouter initialEntries={[`/m/${TOKEN}`]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <Routes><Route path="/m/:token" element={<MinutaPublica />} /></Routes>
  </MemoryRouter>,
);
const escribirCodigo = (codigo: string) => {
  fireEvent.change(screen.getByLabelText('Código de acceso'), { target: { value: codigo } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
};

describe('MinutaPublica', () => {
  it('pide el código, luego quién eres entre las personas a quienes se envió, y muestra la minuta', async () => {
    abrir();
    escribirCodigo('k7p2qx');
    await waitFor(() => expect(m.entrarCodigo).toHaveBeenCalledWith(TOKEN, 'k7p2qx'));
    expect(await screen.findByText('Seguimiento semanal')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'María León' }));
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(m.entrarNombre).toHaveBeenCalledWith(TOKEN, 'k7p2qx', 'María León'));
    expect(await screen.findByRole('heading', { name: 'Panel de alertas' })).toBeInTheDocument();
    expect(m.verMinuta).toHaveBeenCalledWith(TOKEN, 'sesion-1');
    expect(api.sesionGuardada.leer(TOKEN)).toBe('sesion-1');
  });

  it('"Otra persona" deja escribir el nombre', async () => {
    abrir();
    escribirCodigo('K7P2QX');
    fireEvent.click(await screen.findByRole('radio', { name: 'Otra persona' }));
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Luis Mora' } });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    await waitFor(() => expect(m.entrarNombre).toHaveBeenCalledWith(TOKEN, 'K7P2QX', 'Luis Mora'));
  });

  it('dice si el código no es correcto o si hay demasiados intentos', async () => {
    m.entrarCodigo.mockRejectedValueOnce(new ErrorEnlace(401, 'El código no es correcto.'));
    abrir();
    escribirCodigo('AAAAAA');
    expect(await screen.findByRole('alert')).toHaveTextContent('El código no es correcto.');
    m.entrarCodigo.mockRejectedValueOnce(new ErrorEnlace(429, 'Demasiados intentos. Prueba de nuevo en 15 minutos.'));
    escribirCodigo('AAAAAA');
    expect(await screen.findByText('Demasiados intentos. Prueba de nuevo en 15 minutos.')).toBeInTheDocument();
  });

  it('con una sesión guardada entra directo; si ya no sirve, vuelve a pedir el código con su nombre recordado', async () => {
    api.sesionGuardada.guardar(TOKEN, 'sesion-vieja');
    api.nombreRecordado.guardar(TOKEN, 'María León');
    m.verMinuta.mockRejectedValueOnce(new ErrorEnlace(401, 'Vuelve a ingresar el código.'));
    abrir();
    expect(await screen.findByLabelText('Código de acceso')).toBeInTheDocument();
    expect(api.sesionGuardada.leer(TOKEN)).toBeNull();
    escribirCodigo('K7P2QX');
    expect(await screen.findByRole('radio', { name: 'María León' })).toBeChecked();
  });

  it('un enlace apagado lo dice y no pide nada', async () => {
    m.entrarCodigo.mockRejectedValueOnce(new ErrorEnlace(404, 'Este enlace ya no está disponible.'));
    abrir();
    escribirCodigo('K7P2QX');
    expect(await screen.findByText('Este enlace ya no está disponible. Pídele uno nuevo a tu contacto en Qbit.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Código de acceso')).not.toBeInTheDocument();
  });

  it('el cliente aprueba y comenta con sus propias palabras, sin salida hacia Tiusdei', async () => {
    api.sesionGuardada.guardar(TOKEN, 'sesion-1');
    m.aprobarPunto.mockResolvedValue(minuta('aprobado'));
    m.comentarPunto.mockResolvedValue(minuta('aprobado', [{ id: 'n1', tipo: 'nota', texto: 'Se ve bien', created_at: '2026-09-28T15:00:00Z', autor_nombre: 'Antonio Pérez' }]));
    abrir();
    await screen.findByRole('heading', { name: 'Panel de alertas' });
    expect(screen.queryByRole('link', { name: 'Salir de la presentación' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar' }));
    await waitFor(() => expect(m.aprobarPunto).toHaveBeenCalledWith(TOKEN, 'sesion-1', 'i1'));
    fireEvent.click(await screen.findByRole('button', { name: 'Comentar' }));
    fireEvent.change(screen.getByLabelText('Tu comentario'), { target: { value: 'Se ve bien' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar comentario' }));
    await waitFor(() => expect(m.comentarPunto).toHaveBeenCalledWith(TOKEN, 'sesion-1', 'i1', 'Se ve bien'));
    expect(await screen.findByText(/Nota de Antonio Pérez/)).toBeInTheDocument();
    expect(screen.getByText('Comentarios')).toBeInTheDocument();
  });

  it('si la sesión vence mientras actúa, vuelve a pedir el código', async () => {
    api.sesionGuardada.guardar(TOKEN, 'sesion-1');
    m.aprobarPunto.mockRejectedValueOnce(new ErrorEnlace(401, 'Vuelve a ingresar el código.'));
    abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar' }));
    expect(await screen.findByLabelText('Código de acceso')).toBeInTheDocument();
  });
});
