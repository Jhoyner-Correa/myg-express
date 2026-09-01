-- Presentacion visual del usuario independiente del rol y de sus permisos.
-- Una foto cargada por el usuario siempre tiene prioridad sobre este avatar corporativo.

ALTER TABLE `usuarios`
  ADD COLUMN `avatar_variant` ENUM('male', 'female') NOT NULL DEFAULT 'male'
  AFTER `foto`;
