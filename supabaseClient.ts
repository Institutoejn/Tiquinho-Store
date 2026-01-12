
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vkyxpuynqzckpomyxwwc.supabase.co';
const supabaseAnonKey = 'sb_publishable_34GRSQdrp4dhv7_qhu8paQ_nQbEpswl';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
