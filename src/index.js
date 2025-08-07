// Importa as bibliotecas necessárias
const { Client, LocalAuth } = require('whatsapp-web.js'); // Para interagir com o WhatsApp
const qrcode = require('qrcode-terminal'); // Para gerar o QR Code no terminal
// Importa a função de API para interagir com o LLM (agora apenas uma função)
// O 'conversationStates' NÃO é mais importado daqui, pois será gerenciado NESTE arquivo.
const { updateOrderInfoWithLLM } = require('./src/api'); // Assumindo que api.js está na pasta src/



// --- Gerenciamento de Estado da Conversa e Dados do Pedido ---
// Mapa para armazenar o estado da conversa E os dados do pedido para cada chat/contato.
// A chave do mapa será o ID do chat (msg.from).
// O valor será um objeto contendo { state: string, order: object }.
//
// IMPORTANTE: Este mapa armazena os dados APENAS enquanto o script Node.js estiver rodando.
// Se o script for reiniciado, todos os pedidos em andamento serão perdidos.
// Para um bot em produção, esses dados DEVERIAM ser salvos em um banco de dados (como MongoDB, PostgreSQL, etc.)
// ou em um arquivo para persistência.
const conversationStates = new Map();



// Define a estrutura inicial de um pedido
const initialOrderState = {
    nome: '[Não informado]',
    endereco: '[Não informado]',
    pedido: '[Não informado]', // Produtos pedidos com quantidades
    pagamento: '[Não informado]' // Forma de pagamento
};
// --- Fim do Gerenciamento de Estado ---






// Cria uma nova instância do cliente WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(), // Usa a estratégia de autenticação local para salvar a sessão
    // puppeteerOptions: { headless: false } // Mantenha headless: false durante o desenvolvimento para ver o navegador sendo controlado
});



// --- Eventos do Cliente WhatsApp ---



// Evento disparado quando o QR Code é gerado para autenticação
client.on('qr', qr => {
    // Gera e exibe o QR Code no terminal
    qrcode.generate(qr, { small: true });
    console.log('QR RECEIVED', qr);
});



// Evento disparado quando o cliente é autenticado com sucesso
client.on('authenticated', () => {
    console.log('AUTHENTICATED');
});



// Evento disparado quando o cliente está pronto para enviar/receber mensagens
client.on('ready', () => {
    console.log('Client is ready!');
    console.log('Bot do atendente Marcos pronto!');
    // Opcional: Carregar estados/pedidos salvos aqui se estivesse usando persistência (arquivo/BD)
});



// --- Manipulador de Mensagens ---



// Evento disparado quando uma nova mensagem é recebida
client.on('message', async msg => {
    console.log(`Mensagem recebida de ${msg.from}: ${msg.body}`);



    const chatId = msg.from; // ID único do chat (remetente)
    // Obtém o estado e os dados do pedido para este chat.
    // Se o chat não existir no mapa, inicializa com o estado 'initial' e um pedido vazio.
    const chatData = conversationStates.get(chatId) || { state: 'initial', order: { ...initialOrderState } }; // Copia initialOrderState para não modificar a original
    const currentState = chatData.state; // Estado atual da conversa para este chat
    let currentOrder = chatData.order; // Dados atuais do pedido para este chat (vamos atualizar este objeto)



    try {
        // Lógica principal baseada no estado atual da conversa
        switch (currentState) {
            case 'initial':
                // Primeira mensagem do contato neste bot ou após reset/estado desconhecido
                const initialMessage = 'Olá, tudo bem? Aqui é da nippobraz, você fala com o atendente Marcos. O que você deseja? Para agilizar, por favor, liste as informações do seu pedido: *Nome Completo*, *Endereço de Entrega*, *Produtos Desejados* (com quantidades, se souber) e *Forma de Pagamento*. Pode enviar tudo junto ou em mensagens separadas, vou anotando!';
                await msg.reply(initialMessage);



                // Inicializa os dados do pedido para este chat na primeira interação
                chatData.order = { ...initialOrderState };
                // Muda o estado para indicar que estamos esperando as informações do pedido
                chatData.state = 'waiting_for_order_info';
                conversationStates.set(chatId, chatData); // Salva os dados atualizados no mapa



                console.log(`Estado e pedido inicializados para ${chatId}. Estado: ${chatData.state}`);
                break;



            case 'waiting_for_order_info':
                // O bot pediu as informações e está esperando que o cliente as envie (pode vir em várias mensagens)



                if (!msg.body || msg.body.trim() === '') {
                    // Ignora mensagens vazias neste estado
                    console.log(`Mensagem vazia ignorada de ${chatId} no estado ${currentState}.`);
                    return;
                }



                // --- Lógica para extrair/atualizar informações usando o LLM ---
                console.log(`Chamando LLM para extrair/atualizar info do chat ${chatId} com nova mensagem: "${msg.body}"...`);



                // Chama a função do api.js, passando a nova mensagem E o estado ATUAL do pedido
                // A função do LLM retornará a string formatada com as informações ATUALIZADAS
                const updatedOrderString = await updateOrderInfoWithLLM(msg.body, currentOrder);



                console.log(`Resposta bruta do LLM (string atualizada):\n${updatedOrderString}`);



                // --- Lógica para PARSAR a resposta do LLM e ATUALIZAR o objeto currentOrder ---
                // Precisamos analisar a string retornada pelo LLM (ex: "*Nome: ...\n*Endereço: ...\n...")
                // e usar essas informações para atualizar o objeto 'currentOrder'
                const lines = updatedOrderString.split('\n');
                const tempUpdatedOrder = { ...initialOrderState }; // Objeto temporário para armazenar o que o LLM retornou



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
                    // Ignora linhas que não se encaixam no formato esperado
                });



                // Agora, atualizamos o objeto 'currentOrder' com as informações extraídas.
                // Se o LLM retornou "[Não informado]" para algum campo, a gente *mantém* a informação anterior
                // que já estava no 'currentOrder', a menos que a nova resposta seja explicitamente diferente
                // e não seja "[Não informado]".
                // Uma lógica mais simples: apenas substitui os campos se o LLM retornou algo diferente de "[Não informado]"
                // ou se a nova resposta do LLM for "[Não informado]" mas a informação atual NÃO for.
                // Isso permite ao cliente "limpar" um campo enviando algo genérico se o LLM interpretar como "[Não informado]".



                // Vamos fazer uma atualização simples: se o LLM retornou um valor para um campo, usamos ele.
                // Isso simplifica o parsing, mas significa que o LLM *precisa* retornar o estado completo e correto a cada vez.
                // Se o LLM for capaz de retornar "Não informado" para um campo que o usuário não mencionou,
                // mas manter os outros campos que o usuário *não* mencionou, esta lógica simples funciona.
                // O prompt no api.js foi ajustado para tentar fazer isso.



                 if (tempUpdatedOrder.nome !== initialOrderState.nome) currentOrder.nome = tempUpdatedOrder.nome;
                 if (tempUpdatedOrder.endereco !== initialOrderState.endereco) currentOrder.endereco = tempUpdatedOrder.endereco;
                 if (tempUpdatedOrder.pedido !== initialOrderState.pedido) currentOrder.pedido = tempUpdatedOrder.pedido;
                 if (tempUpdatedOrder.pagamento !== initialOrderState.pagamento) currentOrder.pagamento = tempUpdatedOrder.pagamento;






                // Salva os dados do pedido ATUALIZADOS no mapa para este chat
                chatData.order = currentOrder;
                conversationStates.set(chatId, chatData); // Salva o estado e os dados atualizados



                console.log(`Dados do pedido para ${chatId} atualizados:`, currentOrder);






                // Envia uma mensagem de confirmação mostrando o estado ATUAL do pedido
                const confirmationMessage = `Obrigado! Atualizei as informações do seu pedido:\n` +
                                           `*Nome:* ${currentOrder.nome}\n` +
                                           `*Endereço:* ${currentOrder.endereco}\n` +
                                           `*Pedido:* ${currentOrder.pedido}\n` +
                                           `*Forma de Pagamento:* ${currentOrder.pagamento}\n\n` +
                                           `Se precisar mudar algo ou adicionar mais itens, é só mandar outra mensagem.\n` +
                                           `Quando terminar, digite "FINALIZAR PEDIDO". E aguarde o valor e as informações por favor`; // Adiciona instrução para finalizar






                await msg.reply(confirmationMessage);



                // O estado permanece 'waiting_for_order_info' para permitir novas atualizações
                console.log(`Estado do chat ${chatId} manteve: waiting_for_order_info`);



                break;



            case 'order_received':
                // O bot já "recebeu" o pedido finalizado e o usuário enviou mais mensagens
                // Podemos adicionar uma forma de "reabrir" o pedido ou apenas informar que já foi encaminhado.
                // Por enquanto, apenas informa que já foi encaminhado.
                const waitingMessage = 'Obrigado pela sua mensagem. Seu pedido já foi encaminhado para um atendente humano e ele entrará em contato em breve. Por favor, aguarde.';
                await msg.reply(waitingMessage);
                // Mantém o estado como 'order_received'
                console.log(`Chat ${chatId} já em estado 'order_received'. Enviando mensagem de aguardo.`);
                break;



            // --- Adicionar lógica para FINALIZAR o pedido ---
            // O cliente precisa de uma forma de indicar que terminou de fazer o pedido.
            // Vamos adicionar uma checagem ANTES do switch principal, ou como um novo estado.
            // Fazer uma checagem antes do switch é mais simples para um comando rápido.
            // Exemplo: se a mensagem for exatamente "FINALIZAR PEDIDO" (case insensitive)
            // Adicione esta checagem no INÍCIO da função client.on('message', ...), antes do switch.
            // Exemplo de como seria (não incluído no código final para manter o switch como base,
            // mas é a forma ideal de tratar comandos):
            /*
             if (msg.body.trim().toUpperCase() === 'FINALIZAR PEDIDO' && currentState === 'waiting_for_order_info') {
                 // Processa o pedido final
                 const finalOrder = conversationStates.get(chatId).order;
                 // Aqui você faria algo com o pedido final (salvar em BD, enviar email, etc.)
                 console.log('Pedido Finalizado para', chatId, ':', finalOrder);



                 await msg.reply('Ok! Seu pedido foi finalizado e encaminhado:');
                 await msg.reply(`*Nome:* ${finalOrder.nome}\n*Endereço:* ${finalOrder.endereco}\n*Pedido:* ${finalOrder.pedido}\n*Forma de Pagamento:* ${finalOrder.pagamento}\n\nEm breve, um atendente humano entrará em contato para confirmar e dar seguimento.');



                 // Muda o estado para 'order_received'
                 conversationStates.get(chatId).state = 'order_received';
                 console.log(`Estado do chat ${chatId} mudou para: order_received (Finalizado pelo cliente)`);



                 return; // Importante retornar para não processar a mensagem "FINALIZAR PEDIDO" no switch
             }
             */
            // Implementação simples: vamos tratar o comando "FINALIZAR PEDIDO" *dentro* do estado waiting_for_order_info
            // no começo do case 'waiting_for_order_info'.



            default:
                // Estado desconhecido - trata como inicial ou envia uma mensagem de erro
                console.warn(`Estado desconhecido (${currentState}) para o chat ${chatId}. Tratando como inicial.`);
                const defaultMessage = 'Olá! Sou um assistente automático. Se você precisa fazer um pedido, por favor, liste seu nome, endereço, os produtos desejados e a forma de pagamento. Você pode enviar as informações aos poucos, vou anotando. Digite "FINALIZAR PEDIDO" quando terminar.';
                await msg.reply(defaultMessage);
                 // Inicializa estado e pedido como se fosse a primeira mensagem
                chatData.order = { ...initialOrderState };
                chatData.state = 'waiting_for_order_info';
                conversationStates.set(chatId, chatData);
                console.log(`Estado do chat ${chatId} resetado para: waiting_for_order_info`);
                break;
        }



    } catch (erro) {
        console.error(`Erro no manipulador de mensagem para chat ${chatId}:`, erro);
        // Resposta de erro genérica caso algo dê errado na lógica do switch ou chamada da API
        msg.reply('Desculpe, ocorreu um erro interno ao processar sua mensagem.');
        // Opcional: Remover o estado do chat ou resetar para 'initial' em caso de erro crítico
        // conversationStates.delete(chatId);
        // conversationStates.set(chatId, { state: 'initial', order: { ...initialOrderState } });
    }
});






// --- Inicialização do Cliente ---



// Inicia o cliente WhatsApp. Isso começa o processo de autenticação ou carregamento da sessão.
client.initialize();



// --- Limpeza Opcional de Estados Inativos ---
// Em um bot real, você precisaria de lógica para limpar chats inativos após um tempo
// ou ao desconectar, para não acumular muitos dados na memória.
// Ex: setInterval(() => { /* lógica para verificar e remover chats inativos */ }, tempoEmMilissegundos);

