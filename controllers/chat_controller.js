const mongoose = require('mongoose');
const fs = require('fs');
const ChatMember = require('../models/ChatMember');
const Chat = require('../models/Chat');

const user_controller = require('./user_controller');
const chatMessage_controller = require('./chatMessage_controller');
const { db_defaults, root_folder, static_files_folder, avatars_folder } = require('../config');

function badResp(res, message)
{
    res.status(400).json({message: message});
}

async function deleteChatFromDB(chat_id)
{
    try
    {
        await ChatMember.deleteMany({chat_id: chat_id});
        await chatMessage_controller.deleteMessagesFromChat({chat_id: chat_id});
        await Chat.findByIdAndDelete(chat_id);
        return true;
    }
    catch
    {
        return false;
    }
}


class chat_controller
{
    async chatInfo(req, res)
    {
        const { chat_id } = req.body;

        if(chat_id)
        {
            let chatInfo = await Chat.findOne({_id: chat_id});

            const conv_members = await ChatMember.find({chat_id: chat_id});

            let conv_member_IDs = [];

            for (let i = 0; i < conv_members.length; i++)
            {
                conv_member_IDs.push(conv_members[i].member_id);
            }

            res.status(200).json(
            {
                chat_id: chat_id,
                chat_kind: chatInfo.chat_kind,
                chat_title: chatInfo.chat_title,
                chat_avatar_path: chatInfo.chat_avatar_path,
                members: conv_member_IDs
            });
        }
        else
        {
            badResp(res, 'body should contain chat_id');
        }
    }

    async chatMembersAmount(chat_id)
    {
        return ChatMember.find({chat_id: chat_id}).countDocuments((err, amount) => { return amount; });
    }

    async addChat(title, contactID_1, contactID_2)
    {
        const new_chat = new Chat({
            _id: new mongoose.Types.ObjectId(),
            chat_title: title,
            chat_kind: db_defaults.chat_kind.chat
        });

        let chat_members =
        [
            new ChatMember({
                _id: new mongoose.Types.ObjectId(),
                chat_id: new_chat._id,
                member_id: contactID_1
            }),
            new ChatMember({
                _id: new mongoose.Types.ObjectId(),
                chat_id: new_chat._id,
                member_id: contactID_2
            }),
        ];

        chat_members.forEach(chat_member =>
        {
            chat_member.save();
        });

        await new_chat.save();
        return new_chat._id;
    }

    async deleteChat(chat_id)
    {
        return await deleteChatFromDB(chat_id);
    }

    async getUserChats(user_id)
    {
       const user_chat_members = await ChatMember.find({member_id: user_id});

        let chat_IDs = [];

        for (let i = 0; i < user_chat_members.length; i++)
        {
            chat_IDs.push(user_chat_members[i].chat_id);
        }

        return chat_IDs;
    }

    async conversations(req, res)
    {
        const user_login = req.params['login'];
        if(user_login)
        {
            const user_id = await user_controller.getUserIdByLogin(user_login);

            if(user_id == null)
            {
                badResp(res, `login ${user_login} was not found`);
            }

            const conversations = await Chat.find({chat_kind: db_defaults.chat_kind.conversation});

            let conversation_IDs = [];

            for (let i = 0; i < conversations.length; i++)
            {
                conversation_IDs.push(conversations[i]._id);
            }

            const user_conv_members = await ChatMember.find({
                                                        $and:[
                                                            {chat_id: { $in: conversation_IDs } },
                                                            {member_id: user_id}
                                                        ]});

            let user_conversation_IDs = [];
            for (let i = 0; i < user_conv_members.length; i++)
            {
                user_conversation_IDs.push(user_conv_members[i].chat_id);
            }

            const user_conversations = await Chat.find({_id: { $in: user_conversation_IDs } });

            let respObj = [];

            for (let i = 0; i < user_conversations.length; i++)
            {
                respObj.push({
                    chat_id:                user_conversations[i]._id,
                    chat_title:             user_conversations[i].chat_title,
                    chat_kind:              user_conversations[i].chat_kind,
                    chat_avatar_path:       user_conversations[i].chat_avatar_path,
                    members_amount:         await ChatMember.find({chat_id: user_conversations[i]._id}).countDocuments(),
                    unread_messages_amount: await chatMessage_controller.getUnreadMessagesAmount(user_conversations[i]._id, user_id)
                });
            }

            res.status(200).json(respObj);
        }
        else
        {
            badResp(res, 'login param not found');
        }
    }

    async addConv(req, res)
    {
        const { chat_title, chat_avatar_path, member_logins } = req.body;

        if(chat_title && chat_avatar_path && member_logins)
        {
            let new_chat = new Chat({
                _id: new mongoose.Types.ObjectId(),
                chat_title: chat_title,
                chat_kind: db_defaults.chat_kind.conversation,
                chat_avatar_path: chat_avatar_path
            });

            let chat_members = [];

            for (let i = 0; i < member_logins.length; i++)
            {
                chat_members.push( new ChatMember({
                    _id: new mongoose.Types.ObjectId(),
                    chat_id: new_chat._id,
                    member_id: await user_controller.getUserIdByLogin(member_logins[i])
                }));
            }

            chat_members.forEach(chat_member =>
            {
                chat_member.save();
            });

            await new_chat.save();

            let chat_member_IDs = [];

            for (let i = 0; i < chat_members.length; i++)
            {
                chat_member_IDs.push(chat_members[i].member_id);
            }

            res.status(200).json( {chat_id: new_chat._id} );
        }
        else
        {
            badResp(res, 'body should contain: chat_title, chat_avatar_path and [member_logins]');
        }
    }

    async leaveFromConv(req, res)
    {
        const { request_login, chat_id_string } = req.body;

        if(chat_id_string && request_login)
        {
            const chat_id = mongoose.Types.ObjectId(chat_id_string);
            const member_id = await user_controller.getUserIdByLogin(request_login);

            if(member_id == null)
            {
                badResp(res, `login ${request_login} was not found`);
            }

            const found_chat_member = await ChatMember.deleteOne({
                $and:[
                    {chat_id: chat_id},
                    {member_id: member_id}
                ]});

            if(found_chat_member == null)
            {
                badResp(res, `member or chat was not found`);
            }

            await ChatMember.find({chat_id: chat_id}).countDocuments((err, amount) =>
            {
                if(amount == 0)
                {
                    deleteChatFromDB(chat_id);
                    const dir = root_folder + static_files_folder + avatars_folder + '\\';
                    fs.readdir(dir, (err, files) => {
                        files.forEach(file =>
                        {
                            if(file.split('.')[0] == chat_id)
                            {
                                fs.unlink(dir + file, () => {});
                            }
                        });
                    });
                }
            });

            res.status(200).json({chat_id: chat_id});
        }
        else
        {
            badResp(res, 'body should contain: chat_id');
        }
    }
}

module.exports = new chat_controller();