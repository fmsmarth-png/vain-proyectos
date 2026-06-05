import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://swjmqtnhdtiwopexbezx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN3am1xdG5oZHRpd29wZXhiZXp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMzI1NjEsImV4cCI6MjA5NDkwODU2MX0.j_hdhVHQdap5JvL4iRQc2WdySrKV768Y7Jf9sc4pz7A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);