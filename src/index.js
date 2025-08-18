// Importa as bibliotecas necessárias
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { updateOrderInfoWithLLM } = require('./api');


// --- Gerenciamento de Estado da Conversa e Dados do Pedido ---
const conversationStates = new Map();


// Define a estrutura inicial de um pedido
const initialOrderState = {
    nome: '[Não informado]',
    endereco: '[Não informado]',
    pedido: '[Não informado]',
    pagamento: '[Não informado]'
};
// --- Fim do Gerenciamento de Estado ---


// --- Adicionado: Lista de IDs permitidos e a função de verificação ---
const IDS_PERMITIDOS = [
    '559182240037@c.us',
    '5521888888888@c.us'
];

function deveResponder(chatId) {
    return IDS_PERMITIDOS.includes(chatId);
}
// --- Fim da nova função ---


// --- NOVO: Função para criar uma pausa assíncrona ---
const delay = ms => new Promise(res => setTimeout(res, ms));


// Cria uma nova instância do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    // puppeteerOptions: { headless: false }
});


// --- Eventos do Cliente WhatsApp ---
client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('QR RECEIVED', qr);
});

client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});

client.on('ready', () => {
    console.log('Client is ready!');
    console.log('Bot do atendente Marcos pronto!');
});


// --- Manipulador de Mensagens ---
client.on('message', async msg => {
    console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);


    // --- Verificação da lista de permissões ---
    if (!deveResponder(msg.from) || msg.fromMe) {
        console.log(`Mensagem de ${msg.from} não está na lista de permissões ou é de mim mesmo. Ignorando.`);
        return;
    }


    const chatId = msg.from;
    const chatData = conversationStates.get(chatId) || { state: 'initial', order: { ...initialOrderState } };
    const currentState = chatData.state;
    let currentOrder = chatData.order;


    try {
        switch (currentState) {
            case 'initial':
                // --- MUDANÇA AQUI: Mensagens divididas e enviadas com um pequeno delay. ---
                const initialMessages = [
                    'Olá! Seja bem-vindo à Nippobraz.',
                    'Eu sou o *assistente de atendimento Marcos*, um robô programado para anotar as informações do seu pedido de forma rápida e eficiente.',
                    'Para agilizarmos, por favor, siga este mini guia:',
                    '1. Por gentileza envie seu nome, endereço, produtos com a devida quantidade e marca se possível e forma de pagamento, por partes para eu ir anotando para você.',
                    '2. Quando terminar de passar todas as informações, digite a palavra "FINALIZAR PEDIDO".',
                    '3. Após a sua confirmação, um atendente humano irá assumir o seu pedido para dar seguimento.',
                    'Agradecemos a sua cooperação. Sua ajuda em seguir este processo nos permite atendê-lo com mais rapidez!'
                ];
                
                // Envia cada mensagem do array com um pequeno delay de 1 segundo
                for (const message of initialMessages) {
                    await client.sendMessage(chatId, message);
                    await delay(1000); // Aguarda 1000 milissegundos (1 segundo)
                }

                chatData.order = { ...initialOrderState };
                chatData.state = 'waiting_for_order_info';
                conversationStates.set(chatId, chatData);
                console.log(`Estado e pedido inicializados para ${chatId}. Estado: ${chatData.state}`);
                break;


            case 'waiting_for_order_info':
                if (msg.body && msg.body.trim().toUpperCase() === 'FINALIZAR PEDIDO') {
                    const finalOrder = currentOrder;
                    console.log('Pedido Finalizado para', chatId, ':', finalOrder);
                    
                    const finalReply = `Ok! Seu pedido foi finalizado e encaminhado.\n\n` +
                                       `*RESUMO DO PEDIDO:*
*Nome:* ${finalOrder.nome}
*Endereço:* ${finalOrder.endereco}
*Pedido:* ${finalOrder.pedido}
*Forma de Pagamento:* ${finalOrder.pagamento}\n\n` +
                                       `Em breve, um atendente humano entrará em contato para confirmar e dar seguimento.`;
                                       
                    await msg.reply(finalReply);
                    
                    chatData.state = 'order_received';
                    conversationStates.set(chatId, chatData);
                    console.log(`Estado do chat ${chatId} mudou para: order_received (Finalizado pelo cliente)`);
                    return;
                }

                if (!msg.body || msg.body.trim() === '') {
                    console.log(`Mensagem vazia ignorada de ${chatId} no estado ${currentState}.`);
                    return;
                }

                console.log(`Chamando LLM para extrair/atualizar info do chat ${chatId} com nova mensagem: "${msg.body}"...`);
                const updatedOrderString = await updateOrderInfoWithLLM(msg.body, currentOrder);
                console.log(`Resposta bruta do LLM (string atualizada):\n${updatedOrderString}`);

                const lines = updatedOrderString.split('\n');
                const tempUpdatedOrder = { ...initialOrderState };

                lines.forEach(line => {
                    if (line.startsWith('*Nome:')) {
                        tempUpdatedOrder.nome = line.substring('*Nome:'.length).trim();
                    } else if (line.startsWith('*Endereço:')) {
                        tempUpdatedOrder.endereco = line.substring('*Endereço:'.length).trim();
                    } else if (line.startsWith('*Pedido:')) {
                        tempUpdatedOrder.pedido = line.substring('*Pedido:'.length).trim();
                    } else if (line.startsWith('*Forma de Pagamento:')) {
                        tempUpdatedOrder.pagamento = line.substring('*Forma de Pagamento:'.length).trim();
                    }
                });

                 if (tempUpdatedOrder.nome !== initialOrderState.nome) currentOrder.nome = tempUpdatedOrder.nome;
                 if (tempUpdatedOrder.endereco !== initialOrderState.endereco) currentOrder.endereco = tempUpdatedOrder.endereco;
                 if (tempUpdatedOrder.pedido !== initialOrderState.pedido) currentOrder.pedido = tempUpdatedOrder.pedido;
                 if (tempUpdatedOrder.pagamento !== initialOrderState.pagamento) currentOrder.pagamento = tempUpdatedOrder.pagamento;

                chatData.order = currentOrder;
                conversationStates.set(chatId, chatData);

                console.log(`Dados do pedido para ${chatId} atualizados:`, currentOrder);

                const confirmationMessage = `Obrigado! Atualizei as informações do seu pedido:\n` +
                                           `*Nome:* ${currentOrder.nome}\n` +
                                           `*Endereço:* ${currentOrder.endereco}\n` +
                                           `*Pedido:* ${currentOrder.pedido}\n` +
                                           `*Forma de Pagamento:* ${currentOrder.pagamento}\n\n` +
                                           `Se precisar mudar algo ou adicionar mais itens, é só mandar outra mensagem.\n` +
                                           `Quando terminar, digite "FINALIZAR PEDIDO".`;

                await msg.reply(confirmationMessage);
                console.log(`Estado do chat ${chatId} manteve: waiting_for_order_info`);
                break;


            case 'order_received':
                console.log(`Chat ${chatId} já em estado 'order_received'. Nova mensagem recebida, mas o bot não irá responder.`);
                break;


            default:
                console.warn(`Estado desconhecido (${currentState}) para o chat ${chatId}. Tratando como inicial.`);
                const defaultMessage = 'Olá! Sou um assistente automático. Se você precisa fazer um pedido, por favor, liste seu nome, endereço, os produtos desejados e a forma de pagamento. Você pode enviar as informações aos poucos, vou anotando. Digite "FINALIZAR PEDIDO" quando terminar.';
                await msg.reply(defaultMessage);
                chatData.order = { ...initialOrderState };
                chatData.state = 'waiting_for_order_info';
                conversationStates.set(chatId, chatData);
                console.log(`Estado do chat ${chatId} resetado para: waiting_for_order_info`);
                break;
        }

    } catch (erro) {
        console.error(`Erro no manipulador de mensagem para chat ${chatId}:`, erro);
        msg.reply('Desculpe, ocorreu um erro interno ao processar sua mensagem.');
    }
});


// --- Inicialização do Cliente ---
client.initialize();