// @ts-check
// Externalized UI strings for Muse Live Functions (Languages rule: no hard-coded
// UI text in new modules; en/es/pt first).
//
// Locale resolution: Accept-Language primary subtag (pt-BR → pt, es-MX → es),
// English fallback. Dates/times cross the API as ISO strings; display formatting
// is the client's job per user and per show locale.
//
// NON-NEGOTIABLE: safety-critical and contractual copy is never machine-translated
// without human review. These short error strings still want a native-speaker pass
// before a judged demo.
const STRINGS = {
  en: {
    signIn: 'Sign in required',
    adminsOnly: 'Admins only',
    readOnly: 'Your role is read-only.',
    forbiddenOrigin: 'Forbidden origin',
    badBody: 'Body must be JSON',
    badId: 'Bad id.',
    badDate: 'Bad date.',
    methodNotAllowed: 'Method not allowed',
    needD1Transcripts: 'Transcripts need the MUSE_D1 binding.',
    needD1Media: 'Media needs the MUSE_D1 binding.',
    needR2Media: 'Media needs the MUSE_MEDIA binding.',
    needAuditBinding: 'Audit log needs the MUSE_D1 or MUSE_KV binding.',
    showRequired: 'show is required.',
    titleRequired: 'title is required.',
    transcriptTooBig: 'Transcript exceeds 256 KB',
    noSuchTranscript: 'No such transcript.',
    noSuchMedia: 'No such media.',
    blobMissing: 'Blob missing from storage.',
    storageWriteFailed: 'Storage write failed.',
    emptyUpload: 'Empty upload.',
    fileTooBig: 'File exceeds 25 MB',
  },
  es: {
    signIn: 'Inicia sesión para continuar.',
    adminsOnly: 'Solo para administradores.',
    readOnly: 'Tu rol es de solo lectura.',
    forbiddenOrigin: 'Origen no permitido.',
    badBody: 'El cuerpo debe ser JSON.',
    badId: 'Identificador inválido.',
    badDate: 'Fecha inválida.',
    methodNotAllowed: 'Método no permitido.',
    needD1Transcripts: 'Las transcripciones necesitan el enlace MUSE_D1.',
    needD1Media: 'Los archivos necesitan el enlace MUSE_D1.',
    needR2Media: 'Los archivos necesitan el enlace MUSE_MEDIA.',
    needAuditBinding: 'El registro de auditoría necesita el enlace MUSE_D1 o MUSE_KV.',
    showRequired: 'show es obligatorio.',
    titleRequired: 'title es obligatorio.',
    transcriptTooBig: 'La transcripción supera los 256 KB.',
    noSuchTranscript: 'Transcripción no encontrada.',
    noSuchMedia: 'Archivo no encontrado.',
    blobMissing: 'El archivo falta en el almacenamiento.',
    storageWriteFailed: 'No se pudo guardar el archivo.',
    emptyUpload: 'Subida vacía.',
    fileTooBig: 'El archivo supera los 25 MB.',
  },
  pt: {
    signIn: 'Inicie sessão para continuar.',
    adminsOnly: 'Somente para administradores.',
    readOnly: 'Sua função é somente leitura.',
    forbiddenOrigin: 'Origem não permitida.',
    badBody: 'O corpo deve ser JSON.',
    badId: 'Identificador inválido.',
    badDate: 'Data inválida.',
    methodNotAllowed: 'Método não permitido.',
    needD1Transcripts: 'As transcrições precisam da vinculação MUSE_D1.',
    needD1Media: 'Os arquivos precisam da vinculação MUSE_D1.',
    needR2Media: 'Os arquivos precisam da vinculação MUSE_MEDIA.',
    needAuditBinding: 'O registro de auditoria precisa da vinculação MUSE_D1 ou MUSE_KV.',
    showRequired: 'show é obrigatório.',
    titleRequired: 'title é obrigatório.',
    transcriptTooBig: 'A transcrição excede 256 KB.',
    noSuchTranscript: 'Transcrição não encontrada.',
    noSuchMedia: 'Arquivo não encontrado.',
    blobMissing: 'O arquivo está ausente no armazenamento.',
    storageWriteFailed: 'Não foi possível salvar o arquivo.',
    emptyUpload: 'Envio vazio.',
    fileTooBig: 'O arquivo excede 25 MB.',
  },
};

/** Pick en/es/pt from the request. @param {any} request */
export function resolveLang(request) {
  try {
    const first = String(request.headers.get('Accept-Language') || '').split(',')[0].trim().split(';')[0].trim().toLowerCase();
    const base = first.split('-')[0];
    if (base === 'es' || base === 'pt') return base;
  } catch (e) {}
  return 'en';
}

/** Look up a string with English fallback. @param {string} lang @param {string} key @param {any} [vars] */
export function t(lang, key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let s = table[key] || STRINGS.en[key] || key;
  if (vars) for (const k of Object.keys(vars)) s = s.split('{' + k + '}').join(String(vars[k]));
  return s;
}
