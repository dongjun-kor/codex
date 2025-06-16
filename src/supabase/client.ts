import { createClient } from '@supabase/supabase-js';

// Supabase 설정
const supabaseUrl = 'https://mmbconpyzgsfmogvaosr.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tYmNvbnB5emdzZm1vZ3Zhb3NyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MDEyNDEsImV4cCI6MjA2MzM3NzI0MX0.Lrd_kfrqMqtRIRKyET1DKHSZa0uRMYZBnSSazjzhmRM';

// Supabase 클라이언트 생성
export const supabase = createClient(supabaseUrl, supabaseKey); 