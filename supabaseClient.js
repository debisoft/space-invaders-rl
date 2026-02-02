
const supabaseUrl = 'https://xmbqruzxzztisuatrlji.supabase.co';
const supabaseKey = 'sb_publishable_NsgjQCgzkGkeXAtfJlJmMA_RM_ZvaE8';
const _supabase = supabase.createClient(supabaseUrl, supabaseKey);
window.supabase = _supabase;

console.log("Supabase client initialized");
