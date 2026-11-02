// Calendar periods are UTC, independent of the host and scheduling timezone.
function periods(now = new Date()) {
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    return { week: `week-${monday.toISOString().slice(0, 10)}`, month: now.toISOString().slice(0, 7), year: `year-${now.getUTCFullYear()}` };
}

function periodStart(key) {
    if (/^week-\d{4}-\d{2}-\d{2}$/.test(key)) return `${key.slice(5)}T00:00:00.000Z`;
    if (/^\d{4}-\d{2}$/.test(key)) return `${key}-01T00:00:00.000Z`;
    if (/^year-\d{4}$/.test(key)) return `${key.slice(5)}-01-01T00:00:00.000Z`;
    throw new Error("Invalid usage period");
}

module.exports = { periods, periodStart };
