export function externalStackDisplayName(name: string): string {
    return name.replace(/^(external-)+/i, "") || name;
}

export function suggestedExternalStackName(project: string): string {
    const clean = project.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
    return (externalStackDisplayName(clean) || "stack").slice(0, 96);
}
