import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import MinutaPublica from './MinutaPublica';
import * as minutasApi from '@/lib/minutasApi';
import type { MinutaPublica as Datos } from '@/lib/minutasApi';

vi.mock('@/lib/minutasApi', () => ({ obtenerMinutaPublica: vi.fn() }));

const datos: Datos = {
  marca: 'Dinatek', codigo: 'M-03', titulo: 'Revisión de avance: home y catálogo', fecha: '2026-09-22',
  puntos: [
    { numero: 1, titulo: 'Filtro por marca', descripcion: 'Sobre todo en celular.', estado: 'en_curso', responsable_cliente: false, fecha_compromiso: '2026-10-06', resolucion: null, evidencias: [] },
    { numero: 2, titulo: 'Video en el home', descripcion: null, estado: 'completado', responsable_cliente: false, fecha_compromiso: null,
      resolucion: 'Video de 12 s en el home.', evidencias: [
        { tipo: 'enlace', nombre: 'Home en staging', url: 'https://staging.example.com/home' },
        { tipo: 'imagen', nombre: 'captura-home.png', url: 'https://tiusdei.qbit.ec/uploads/editor/a.png' },
      ] },
    { numero: 3, titulo: 'Fichas técnicas', descripcion: null, estado: 'pendiente', responsable_cliente: true, fecha_compromiso: null, resolucion: null, evidencias: [] },
  ],
};

function abrir() {
  render(
    <MemoryRouter initialEntries={['/m/mn_abc']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes><Route path="/m/:token" element={<MinutaPublica />} /></Routes>
    </MemoryRouter>,
  );
}

describe('MinutaPublica', () => {
  beforeEach(() => { vi.mocked(minutasApi.obtenerMinutaPublica).mockReset(); });

  it('muestra los puntos al cliente en su lenguaje, con lo hecho y la evidencia', async () => {
    vi.mocked(minutasApi.obtenerMinutaPublica).mockResolvedValue(datos);
    abrir();
    expect(await screen.findByRole('heading', { name: 'Revisión de avance: home y catálogo' })).toBeInTheDocument();
    expect(minutasApi.obtenerMinutaPublica).toHaveBeenCalledWith('mn_abc');
    expect(screen.getByText(/Dinatek · M-03 · 22 sep 2026/)).toBeInTheDocument();
    expect(screen.getByText('1 de 3 puntos listos')).toBeInTheDocument();
    const filtro = screen.getByRole('listitem', { name: 'Punto 1' });
    expect(filtro).toHaveTextContent('En marcha');
    expect(filtro).toHaveTextContent('Sobre todo en celular.');
    expect(filtro).toHaveTextContent('Compromiso: 6 oct');
    const video = screen.getByRole('listitem', { name: 'Punto 2' });
    expect(video).toHaveTextContent('Listo');
    expect(video).toHaveTextContent('Qué hicimos');
    expect(video).toHaveTextContent('Video de 12 s en el home.');
    expect(screen.getByRole('link', { name: /Home en staging/ })).toHaveAttribute('href', 'https://staging.example.com/home');
    expect(screen.getByRole('img', { name: 'captura-home.png' })).toBeInTheDocument();
    expect(screen.getByRole('listitem', { name: 'Punto 3' })).toHaveTextContent('Pendiente de tu parte');
  });

  it('avisa si el enlace no existe o fue desactivado', async () => {
    vi.mocked(minutasApi.obtenerMinutaPublica).mockRejectedValue(new Error('Este enlace no existe o fue desactivado.'));
    abrir();
    expect(await screen.findByText('Este enlace no existe o fue desactivado.')).toBeInTheDocument();
  });
});
