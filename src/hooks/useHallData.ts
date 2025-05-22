import { useState, useEffect } from 'react';
import { HallData } from '../types';
import { fetchHallData } from '../services/api';

export const useHallData = (selectedDate: Date) => {
    const [halls, setHalls] = useState<HallData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);
                const data = await fetchHallData(selectedDate);
                setHalls(data);
            } catch (err) {
                setError('Failed to load hall data');
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [selectedDate]);

    return { halls, loading, error };
};
