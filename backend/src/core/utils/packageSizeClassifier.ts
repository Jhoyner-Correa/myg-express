export type PackageSizeCode = 'pequeno' | 'mediano' | 'grande' | 'super_grande';

export type PackageSize = {
  codigo: PackageSizeCode;
  label: string;
  rango: string;
  peso_min_kg: number;
  peso_max_kg: number | null;
};

const PACKAGE_SIZE_RULES: PackageSize[] = [
  {
    codigo: 'pequeno',
    label: 'Pequeño',
    rango: 'Hasta 1 kg',
    peso_min_kg: 0,
    peso_max_kg: 1
  },
  {
    codigo: 'mediano',
    label: 'Mediano',
    rango: 'Más de 1 kg hasta 3 kg',
    peso_min_kg: 1.001,
    peso_max_kg: 3
  },
  {
    codigo: 'grande',
    label: 'Grande',
    rango: 'Más de 3 kg hasta 10 kg',
    peso_min_kg: 3.001,
    peso_max_kg: 10
  },
  {
    codigo: 'super_grande',
    label: 'Super grande',
    rango: 'Más de 10 kg',
    peso_min_kg: 10.001,
    peso_max_kg: null
  }
];

export function classifyPackageSize(pesoKg: unknown): PackageSize | null {
  const weight = Number(pesoKg);
  if (!Number.isFinite(weight) || weight < 0) return null;

  const rule = PACKAGE_SIZE_RULES.find((item) => {
    const withinMin = weight >= item.peso_min_kg;
    const withinMax = item.peso_max_kg === null || weight <= item.peso_max_kg;
    return withinMin && withinMax;
  });

  return rule ? { ...rule } : null;
}
