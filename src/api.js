// Importa a biblioteca axios para fazer requisições HTTP
const axios = require('axios');



// IMPORTANTE: O mapa conversationStates FOI REMOVIDO daqui e movido para index.js.
// A lógica de gerenciamento de estado e dados do pedido agora reside no arquivo principal.



// --- Função para interagir com a API do LM Studio para Atualizar o Pedido ---
// Esta função agora recebe a nova mensagem do usuário E o estado ATUAL do pedido.
// Ela monta um prompt para o LLM pedindo para ele ATUALIZAR as informações do pedido
// com base na nova mensagem e retornar o estado completo e atualizado no formato especificado.
async function updateOrderInfoWithLLM(userMessage, currentOrder) {
    // Monta o prompt de sistema para instruir o LLM
    // Este prompt agora inclui o estado ATUAL do pedido e a NOVA mensagem.
    // Pede ao LLM para retornar o estado ATUALIZADO.
    const context = `Você é um assistente de extração de informações de pedidos para a nippobraz.
Sua única tarefa é analisar a NOVA MENSAGEM do cliente e USAR essa informação para ATUALIZAR o ESTADO ATUAL DO PEDIDO.
Se a NOVA MENSAGEM mencionar um item (Nome, Endereço, Pedido ou Forma de Pagamento), use a informação da NOVA MENSAGEM.
Se a NOVA MENSAGEM *não* mencionar um item, mantenha a informação que está no ESTADO ATUAL DO PEDIDO.
Sempre retorne o estado COMPLETO e ATUALIZADO do pedido no formato exato especificado, MESMO que apenas uma parte tenha mudado.
Se a NOVA MENSAGEM não contiver NENHUMA informação clara de pedido, mantenha o ESTADO ATUAL DO PEDIDO como está.
Não adicione saudações, despedidas, explicações ou qualquer outro texto.



ESTADO ATUAL DO PEDIDO:
*Nome: ${currentOrder.nome}
*Endereço: ${currentOrder.endereco}
*Pedido: ${currentOrder.pedido}
*Forma de Pagamento: ${currentOrder.pagamento}



NOVA MENSAGEM DO CLIENTE: ${userMessage}



ESTADO ATUALIZADO DO PEDIDO (Retorne APENAS esta lista):
*Nome: [Nome Atualizado ou mantido]
*Endereço: [Endereço Atualizado ou mantido]
*Pedido: [Pedido Atualizado ou mantido]
*Forma de Pagamento: [Pagamento Atualizado ou mantido]`;






    // Configuração do cliente Axios para a API do LM Studio
    const client = axios.create({
        baseURL: 'http://localhost:1234/v1', // <--- VERIFIQUE AQUI! Certifique-se de que a porta (1234) é a correta que o seu LM Studio está usando.
                                            // Esta URL é o endereço onde o LM Studio expõe a API localmente.
        headers: { 'Authorization': 'Bearer not-needed' } // 'not-needed' é o valor comum para API do LM Studio local, pois não exige chave.
    });



    // Dados a serem enviados na requisição POST para o endpoint de chat completions da API
    const data = {
        model: 'YOUR_MODEL_ID_IN_LM_STUDIO', // <--- SUBSTITUA AQUI! Coloque o ID EXATO do modelo que você está rodando no LM Studio (ex: 'Meta-Llama-3.1-8B-Instruct-abliterated.Q4_K_M.gguf' ou 'local-model' se configurado assim).
                                            // Você encontra este ID na interface do LM Studio quando o modelo está carregado e servindo.
        messages: [
            { 'role': 'system', 'content': context }, // O prompt de sistema que define a tarefa
            { 'role': 'user', 'content': 'Analise a "NOVA MENSAGEM DO CLIENTE" e atualize o "ESTADO ATUAL DO PEDIDO" com as informações encontradas. Retorne APENAS o "ESTADO ATUALIZADO DO PEDIDO".' } // A mensagem do usuário pedindo a análise
             // Podemos até simplificar e colocar todo o contexto no role=user se o modelo preferir, mas role=system é o padrão.
             // Vamos manter o contexto como system e a instrução final como user.
        ],
        temperature: 0.1, // Mantemos a temperatura bem baixa (próximo de 0) para respostas mais determinísticas e focadas na extração/atualização.
                         // Valores mais altos tornariam a resposta mais criativa, o que NÃO é desejável para extração estruturada.
        max_tokens: 500, // Número máximo de tokens na resposta. 500 deve ser suficiente para a lista do pedido.
        // Outros parâmetros da API podem ser adicionados aqui se necessário (ex: top_p, frequency_penalty, presence_penalty)
    };



    try {
        console.log('Enviando requisição para a API do LLM...');
        const response = await client.post('/chat/completions', data); // Faz a requisição POST
        console.log('Resposta da API do LLM recebida.');



        // Extrai o conteúdo do texto gerado pelo LLM
        const llmResponseContent = response.data.choices[0].message.content.trim();



        // Retorna a string formatada com as informações atualizadas geradas pelo LLM
        // Index.js será responsável por PARSAR essa string e atualizar o objeto de pedido.
        return llmResponseContent;



    } catch (error) {
        console.error('Erro na chamada da API do LLM:', error.message);



        // Trata erros específicos de conexão para dar feedback útil
        if (error.code === 'ECONNREFUSED') {
             console.error('Detalhe: LM Studio API não está respondendo. Verifique se o LM Studio está rodando e o servidor API está ativo na porta correta (configurada em baseURL).');
             // Retorna uma mensagem amigável informando sobre o problema de conexão
             return 'Desculpe, não consegui me conectar ao sistema de IA para processar seu pedido. Por favor, verifique se o sistema está ativo ou tente novamente mais tarde.';
        }
        // Para outros tipos de erro na API
        return 'Desculpe, ocorreu um erro ao processar sua solicitação com a IA. Poderia repetir ou contatar um atendente humano?';
    }
}



// Removemos getAutoShopAIResponse, agora usamos apenas updateOrderInfoWithLLM
// Exporta a função que será usada pelo index.js
module.exports = { updateOrderInfoWithLLM }; // Exporta SOMENTE a função de atualização
