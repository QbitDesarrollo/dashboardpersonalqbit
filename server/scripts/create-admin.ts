#!/usr/bin/env npx tsx
/**
 * Script para crear un usuario admin en TIUSDEI (MySQL).
 * Uso: cd server && npx tsx scripts/create-admin.ts admin@tiusdei.qbit.ec MiPassword123
 * Requiere: DATABASE_URL en .env
 */

import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { query, queryOne, uuid } from '../src/db/mysql.js';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL || DATABASE_URL.includes('password')) {
  console.error('❌ Configura DATABASE_URL en server/.env con tus credenciales MySQL');
  process.exit(1);
}

async function createAdmin() {
  const email = process.argv[2] || process.env.ADMIN_EMAIL || 'admin@tiusdei.qbit.ec';
  const password = process.argv[3] || process.env.ADMIN_PASS || 'Tiusdei2025!';

  console.log(`📧 Creando usuario admin: ${email}`);

  try {
    const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE email = ?', [email.toLowerCase()]);
    if (existing) {
      await query('UPDATE users SET rol = ?, password_hash = ? WHERE id = ?', ['admin', await bcrypt.hash(password, 10), existing.id]);
      await query('UPDATE profiles SET rol = ? WHERE id = ?', ['admin', existing.id]);
      await query('DELETE FROM user_roles WHERE user_id = ?', [existing.id]);
      await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [uuid(), existing.id, 'admin']);
      console.log('✅ Usuario existente actualizado a admin.');
    } else {
      const id = uuid();
      const passwordHash = await bcrypt.hash(password, 10);
      await query('INSERT INTO users (id, email, password_hash, nombre, rol) VALUES (?, ?, ?, ?, ?)', [id, email.toLowerCase(), passwordHash, 'Administrador', 'admin']);
      await query('INSERT INTO profiles (id, email, nombre, rol) VALUES (?, ?, ?, ?)', [id, email.toLowerCase(), 'Administrador', 'admin']);
      await query('INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, ?)', [uuid(), id, 'admin']);
      console.log('✅ Usuario admin creado correctamente.');
    }
    console.log('');
    console.log('   Email:', email);
    console.log('   Contraseña:', password);
    console.log('');
    console.log('   Inicia sesión en: https://tiusdei.qbit.ec');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createAdmin();
