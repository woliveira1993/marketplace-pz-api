export interface Tenant {
  id: number;
  slug: string;
  name: string;
  email: string;
  password_hash: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface TenantSettings {
  id: number;
  tenant_id: number;
  mp_client_id: string | null;
  mp_client_secret_encrypted: string | null;
  webhook_secret: string | null;
  rcon_host: string | null;
  rcon_port: number | null;
  rcon_password_encrypted: string | null;
  store_name: string | null;
  primary_color: string | null;
  background_color: string | null;
  logo_url: string | null;
  wallpaper_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Item {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  price: string; // Knex returns DECIMAL as string — unit price when allow_custom_quantity=true
  quantity: number; // default quantity (or min display) — ignored when allow_custom_quantity=true
  unit_label: string;
  is_active: boolean;
  sort_order: number;
  allow_custom_quantity: boolean;
  min_quantity: number | null;
  max_quantity: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface RconAction {
  id: number;
  tenant_id: number;
  item_id: number | null;
  command: string;
  exec_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Payment {
  id: number;
  external_reference: string;
  transaction_id: bigint | null;
  amount: string; // DECIMAL returned as string
  status: string;
  delivered: boolean;
  created_at: Date;
  updated_at: Date;
  lumes: bigint | null;
  username: string | null;
  email: string | null;
  error: string | null;
  expiration_date: Date | null;
  tenant_id: number | null;
  item_id: number | null;
  purchased_quantity: number | null;
  subscription_id: number | null;
  plan_id: number | null;
}

export interface RconDeliveryLog {
  id: number;
  payment_id: number;
  rcon_action_id: number | null;
  command_sent: string;
  response: string | null;
  success: boolean;
  error_message: string | null;
  executed_at: Date;
}

export interface RefreshToken {
  id: number;
  tenant_id: number;
  token_hash: string;
  expires_at: Date;
  revoked: boolean;
  created_at: Date;
}

export interface PzCommandParam {
  name: string;
  label: string;
  type: 'text' | 'select' | 'number';
  required: boolean;
  options?: string[];
  placeholder?: string;
  default?: string;
}

export interface PzCommand {
  id: number;
  tenant_id: number | null;
  name: string;
  label: string;
  description: string | null;
  category: string;
  command_template: string;
  params: PzCommandParam[];
  is_dangerous: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface ServerCron {
  id: number;
  tenant_id: number;
  name: string;
  command: string;
  cron_expression: string;
  enabled: boolean;
  last_run_at: Date | null;
  last_status: 'success' | 'error' | null;
  created_at: Date;
  updated_at: Date;
}

export interface ServerCommandLog {
  id: number;
  tenant_id: number;
  command: string;
  response: string | null;
  success: boolean;
  source: 'manual' | 'cron';
  reference_id: number | null;
  executed_at: Date;
}

export interface SubscriptionPlan {
  id: number;
  tenant_id: number;
  name: string;
  description: string | null;
  price: string; // DECIMAL as string
  interval_days: number;
  is_active: boolean;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface PlanItem {
  id: number;
  plan_id: number;
  item_id: number | null;
  name: string | null;
  description: string | null;
  sort_order: number;
}

export interface Subscription {
  id: number;
  tenant_id: number;
  plan_id: number;
  username: string;
  email: string;
  status: 'active' | 'pending_payment' | 'cancelled' | 'expired';
  started_at: Date | null;
  next_payment_due: Date | null;
  last_payment_at: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface SubscriptionAutomation {
  id: number;
  tenant_id: number;
  trigger_event: 'subscription_cancelled' | 'subscription_expired' | 'payment_overdue';
  name: string;
  rcon_command: string;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}
