import crypto from 'node:crypto'

// /!\ DOIT ÊTRE EXACTEMENT LE MÊME QUE DANS LE CODE DE L'ESP32
const COMPANY_SECRET_SALT = "AptatioRacing_TopSecret_2024";

export function generateLicenseKey(macAddress: string, tier: number): string {
	// Nettoyage de l'adresse MAC (forcer les majuscules, supprimer les espaces inutiles)
	const cleanMac = macAddress.trim().toUpperCase();
	
	// Création du payload identique à l'ESP32
	const payload = `${cleanMac}${COMPANY_SECRET_SALT}${tier}`;
	
	// Hachage en SHA-256
	const hash = crypto.createHash('sha256').update(payload).digest('hex');
	
	// Retourne les 12 premiers caractères en majuscules
	return hash.substring(0, 12).toUpperCase();
}