'use server'

export async function trackClick(data: any): Promise<void> {
    console.log('Tracking click (dummy function):', data);
    return Promise.resolve();
}