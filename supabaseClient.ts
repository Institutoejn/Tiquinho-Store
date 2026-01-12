
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://vkyxpuynqzckpomyxwwc.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZreXhwdXlucXpja3BvbXl4d3djIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyMjM5ODcsImV4cCI6MjA4Mzc5OTk4N30.DEZ2yoq4luK-_3X0TqIiXVfExNK4GrNDBFQ07FwFahQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
