export const getDateKeyRiyadh = () => {
  const now = new Date();
  const riyadh = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })
  );

  const year = riyadh.getFullYear();
  const month = String(riyadh.getMonth() + 1).padStart(2, '0');
  const day = String(riyadh.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

export const getSecondsUntilNextRiyadhDay = () => {
  const now = new Date();
  const riyadhNow = new Date(
    now.toLocaleString('en-US', { timeZone: 'Asia/Riyadh' })
  );

  const next = new Date(riyadhNow);
  next.setDate(next.getDate() + 1);
  next.setHours(0, 0, 0, 0);

  return Math.max(
    0,
    Math.floor((next.getTime() - riyadhNow.getTime()) / 1000)
  );
};

export const formatRemaining = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  return `${hours} ساعة و ${minutes} دقيقة`;
};