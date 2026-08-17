import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UserSession } from '../../../core/auth/authState';
import { ProfileModal } from './ProfileModal';

const user: UserSession = {
  id: 3,
  nombre: 'Renzo Administrador',
  usuario: 'renzo_admin',
  rol: 'AdminEmpresa',
  rol_label: 'Administrador general',
  alcance: 'EMPRESA',
  sede_id: null,
  sede_nombre: 'Administración Central',
  estado: 'activo',
};

describe('ProfileModal', () => {
  it('guarda el perfil mediante el contrato del backend sin fabricar un correo', async () => {
    const onSave = vi.fn().mockResolvedValue({ ...user, nombre: 'Renzo Morales' });
    render(<ProfileModal open user={user} onClose={vi.fn()} onSave={onSave} />);

    expect(screen.queryByText(/Correo Institucional/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar información' }));
    fireEvent.change(screen.getByLabelText('Nombres y Apellidos'), { target: { value: 'Renzo Morales' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      nombre: 'Renzo Morales',
      usuario: 'renzo_admin',
    }));
  });

  it('envía las credenciales solo cuando se solicita cambiar la contraseña', async () => {
    const onSave = vi.fn().mockResolvedValue(user);
    render(<ProfileModal open user={user} onClose={vi.fn()} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar información' }));
    fireEvent.change(screen.getByLabelText(/Contraseña Actual/i), { target: { value: 'ActualSegura!123' } });
    fireEvent.change(screen.getByLabelText('Nueva Contraseña'), { target: { value: 'NuevaSegura!123' } });
    fireEvent.change(screen.getByLabelText('Confirmar Nueva Contraseña'), { target: { value: 'NuevaSegura!123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({
      nombre: 'Renzo Administrador',
      usuario: 'renzo_admin',
      password_actual: 'ActualSegura!123',
      nuevo_password: 'NuevaSegura!123',
    }));
  });
});
