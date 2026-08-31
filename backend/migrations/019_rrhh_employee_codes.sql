-- MariaDB 10.4+. Correlativos corporativos para codigos internos de colaboradores.

CREATE TABLE IF NOT EXISTS personal_codigo_empleado_secuencias (
  empresa_id INT UNSIGNED NOT NULL,
  prefijo VARCHAR(10) NOT NULL,
  ultimo_valor INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (empresa_id),
  UNIQUE KEY uq_personal_codigo_empleado_prefijo (prefijo),
  CONSTRAINT fk_personal_codigo_empleado_empresa FOREIGN KEY (empresa_id)
    REFERENCES empresas(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_personal_codigo_empleado_valor CHECK (ultimo_valor >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO personal_codigo_empleado_secuencias (empresa_id, prefijo, ultimo_valor)
SELECT company_prefix.empresa_id,
       company_prefix.prefijo,
       COALESCE(MAX(
         CASE
           WHEN employee.codigo_empleado REGEXP CONCAT('^', company_prefix.prefijo, '-[0-9]+$')
             THEN CAST(SUBSTRING_INDEX(employee.codigo_empleado, '-', -1) AS UNSIGNED)
           ELSE 0
         END
       ), 0) AS ultimo_valor
FROM (
  SELECT company.id AS empresa_id,
         CASE
           WHEN UPPER(company.codigo) = 'MYG_EXPRESS' THEN 'MYG'
           ELSE CONCAT('EMP', company.id)
         END AS prefijo
  FROM empresas company
) company_prefix
LEFT JOIN sedes site ON site.empresa_id = company_prefix.empresa_id
LEFT JOIN personal_empleados employee ON employee.sede_id = site.id
GROUP BY company_prefix.empresa_id, company_prefix.prefijo
ON DUPLICATE KEY UPDATE
  prefijo = VALUES(prefijo),
  ultimo_valor = GREATEST(ultimo_valor, VALUES(ultimo_valor));
