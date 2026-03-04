export interface TemplateVars {
  username?: string;
  quantity?: number | string;
  unit_label?: string;
  item_name?: string;
  amount?: number | string;
  email?: string;
  transaction_id?: number | string;
}

function sanitizeRconValue(value: string): string {
  // Remove chars that could break RCON command structure
  return value.replace(/[;"'\\]/g, '');
}

export function renderCommand(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const val = vars[key as keyof TemplateVars];
    if (val === undefined || val === null) {
      throw new Error(`Unknown or missing template variable: {{${key}}}`);
    }
    return sanitizeRconValue(String(val));
  });
}

export const AVAILABLE_TEMPLATE_VARS: Array<{ name: string; description: string }> = [
  { name: '{{username}}', description: 'Username do jogador (informado no pagamento)' },
  { name: '{{quantity}}', description: 'Quantidade do item (ex: 500 para 500 coins)' },
  { name: '{{unit_label}}', description: 'Unidade do item (ex: lumes, coins)' },
  { name: '{{item_name}}', description: 'Nome completo do item (ex: "500 coins")' },
  { name: '{{amount}}', description: 'Valor pago em BRL (ex: 10.00)' },
  { name: '{{email}}', description: 'Email do pagador' },
  { name: '{{transaction_id}}', description: 'ID da transação no MercadoPago' },
];
