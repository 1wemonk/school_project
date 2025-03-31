import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export const loadSchedule = async (chatId) => {
    const { data } = await supabase
        .from('schedule')
        .select('day, subjects')
        .eq('chat_id', chatId);
    return data.reduce((acc, row) => ({ ...acc, [row.day]: JSON.parse(row.subjects) }), {});
};

export const saveSchedule = async (chatId, day, subjects) => {
    const { error } = await supabase.from('schedule').upsert({
        chat_id: chatId,
        day: day,
        subjects: JSON.stringify(subjects),
    });
    if (error) throw error;
};