// worker.js - Cloudflare Worker pour proxy API Claude
// Déployez ce code sur Cloudflare Workers (gratuit)

export default {
  async fetch(request, env) {
    // Configuration CORS
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Gérer les requêtes OPTIONS (preflight)
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Vérifier que c'est une requête POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { 
        status: 405,
        headers: corsHeaders 
      });
    }

    try {
      // Récupérer les données envoyées par le frontend
      const body = await request.json();
      const { text, mode, tone, context } = body;

      if (!text) {
        return new Response(JSON.stringify({ error: 'Texte manquant' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Construire le prompt selon les paramètres
      const systemPrompt = buildSystemPrompt(mode, tone, context);

      // Appeler l'API Claude
      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY, // Clé API stockée dans les variables d'environnement
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `${systemPrompt}\n\nTexte à corriger :\n${text}`
          }]
        })
      });

      if (!claudeResponse.ok) {
        const error = await claudeResponse.text();
        console.error('Erreur Claude API:', error);
        throw new Error('Erreur API Claude');
      }

      const data = await claudeResponse.json();
      const correctedText = data.content[0].text;

      // Retourner le résultat
      return new Response(JSON.stringify({ correctedText }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error('Erreur:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// Fonction pour construire le prompt système
function buildSystemPrompt(mode, tone, context) {
  const toneText = tone === 'tu' 
    ? 'Utilise le tutoiement (tu, te, ton).' 
    : 'Utilise le vouvoiement (vous, votre).';
  
  const contextText = context === 'email' 
    ? 'un email professionnel' 
    : 'un message Teams';

  const prompts = {
    fix: `Tu es un correcteur expert. Corrige uniquement les fautes d'orthographe, de grammaire, de conjugaison et de ponctuation. Ne change pas le style ni le ton. ${toneText}

Réponds UNIQUEMENT avec le texte corrigé, sans explication.`,
    
    improve: `Tu es un assistant de rédaction professionnelle. Améliore ce texte pour ${contextText} : corrige toutes les erreurs, rends-le plus professionnel, fluide et agréable à lire. ${toneText}

Réponds UNIQUEMENT avec le texte amélioré, sans explication.`,
    
    formal: `Tu es un expert en communication formelle. Transforme ce texte pour le rendre plus formel et professionnel, adapté à ${contextText}. Corrige toutes les erreurs. ${toneText}

Réponds UNIQUEMENT avec le texte formel, sans explication.`,
    
    simple: `Tu es un expert en clarté. Simplifie ce texte : utilise des phrases courtes et un vocabulaire simple tout en restant professionnel pour ${contextText}. Corrige toutes les erreurs. ${toneText}

Réponds UNIQUEMENT avec le texte simplifié, sans explication.`
  };

  return prompts[mode] || prompts.fix;
}
