export function suggestedExternalStackName(project: string): string {
    const clean = project.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return (clean.replace(/^(external-)+/, "") || "stack").slice(0, 96);
}
