export interface GiteaUser {
    id: number;
    login: string;
    full_name: string;
    email: string;
    avatar_url: string;
}

export interface GiteaOrganization {
    id: number;
    username: string;
    full_name: string;
    avatar_url: string;
}

export interface GiteaRepository {
    id: number;
    owner: GiteaUser | GiteaOrganization;
    name: string;
    full_name: string;
    description: string;
    html_url: string;
}