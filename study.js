import plugin from '../../lib/plugins/plugin.js' 
import moment from 'moment';
import schedule from 'node-schedule'
import mysql from 'mysql';
const connection = mysql.createConnection({
	host:'127.0.0.1',   // 主机名 （服务器地址）
	user:'root',    //用户名
	password:'123',    // 密码
	database:'StudyRoom',  // 写上自己要连接的数据库名字
	port:'3306'
});
// let numbers = await redis.get('db:numbers') //自习室人数
// if(!numbers){
//     await redis.set('db:numbers',0)
//     logger.info('初始化自习室人数')
// }

// let list = await redis.get('db:study:userlist') 
// if(!list){
//     await redis.set('db:study:userlist','')

let reset_time =`0 21 22 * * ?`//重置学习状态，保存最后学习时间，持久化redis数据到mysql
schedule.scheduleJob(reset_time, async ()=>{
    console.log('清空自习室');
    let userlist = await redis.get('db:study:userlist')
    userlist =userlist + ""
    let users=userlist.split('|')
    for(let i=0;i<users.length-1;i++){//遍历所有用户,计算学习时间，追加后，重置学习状态
        let flag = await redis.get(`db:study:${users[i]}`)
        if(flag=="1"){//说明忘记推出自习室了，算上最后的时间
            let today=moment().format('MMDD')
            let myDate = new Date();
            let end_time = myDate.getTime();//自1970年..
            let start_time = await redis.get(`db:study:${users[i]}:start_time`)
            let time = end_time - start_time//获取毫秒(且换算成北京时间)
            let oldtime = await redis.get(`db:study:${users[i]}:${today}`)
            if(oldtime){
                time = parseInt(oldtime) + time
            }
            //设置键的生存时间，这里设置到当天晚上的23:59
            let now = new Date();
            let endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
            let timeDiff = endOfDay.getTime() - now.getTime();
            timeDiff = parseInt(timeDiff/1000); //转成秒
            //设置键值
            await redis.set(`db:study:${users[i]}:${today}`,time,'EX',timeDiff)
            await redis.expire(`db:study:${users[i]}:${today}`,timeDiff)
            await redis.zAdd(`db:study:rank:${today}`,{score:parseInt(time/1000),value:`${users[i]}`})
            await redis.expire(`db:study:rank:${today}`,timeDiff)
        }
        //把每一个用户的开始学习时间清空，学习状态重置
        await redis.set(`db:study:${users[i]}`,-1)
        await redis.set(`db:study:${users[i]}:start_time`,0)
    }
    // redis.zRange("myzset", 0, -1, "WITHSCORES", function(err, reply) {
    //     if (err) {
    //       console.error(err);
    //     } else {
    //       console.log(reply); // 回复是一个数组，包含成员和分数交替出现
    //     }
    //   });
    //   //reply形式为[ 'one', '1', 'two', '2', 'three', '3' ]
    // let today = moment().format('YYYY-MM-DD HH:mm:ss')
    // connection.connect(); // 建立连接
    // for(let i=0;i<reply.length;i=i+2){
    //     sql = `insert into study (date,user_id,study_time) values ('${today}','${reply[i]}','${reply[i+1]/60}')`
    //     connection.query(sql, function (err, result) { // 执行SQL语句
    //         if (err) throw err;	
    //         });
    // } 
    // connection.end(); // 关闭连接
    //将redis中的数据持久化到mysql

});


let rereset_time =`0 59 23 * * ?`//真正清空redis
schedule.scheduleJob(rereset_time, async ()=>{
    await redis.set('db:numbers',0)//清空自习室
    await redis.del(`db:study:rank:${today}`)
    await redis.set('db:study:userlist','')
});

export class Study extends plugin {
    constructor(){
        super({
                name: '蒙德自习室',
                dsc: '睡眠',
                event: 'message',
                priority: 3000,
                rule: [
                    {
                        reg: '^(开学|自习|学习|自习室|进入自习室)$',//命令匹配
                        fnc: 'start_study'//执行函数
                      },
                    {
                        reg: '^(下课|离开自习室|结束|结束自习|不学啦|开玩|退出)$',//命令匹配
                        fnc: 'end_study'//执行函数
                    },
                    {
                        reg: '^(自习室排名|自习排名|排名|我的排名)$',//命令匹配
                        fnc: 'get_rank'//执行函数
                    },
                    {
                        reg:'^测试$',
                        fnc:'test_redis'
                        
                    },
                    {
                        reg:'^(自习时间|学习时间|我的学习时间|学习时长)$',
                        fnc:'get_time'
                    },
                    {
                        reg: '^(自习室人数|自习人数|人数|当前人数)$',//命令匹配
                        fnc: 'get_numbers'//执行函数
                    }
                    
                ]
            }
        )
    }

    async start_study (e) {
        let numbers = await redis.get('db:numbers')
        let user = await redis.get(`db:study:${e.user_id}`)
        let myDate = new Date();
        let hours = myDate.getHours();
        let mins = myDate.getMinutes();  //获取当前分钟数(0-59)
        let secs = myDate.getSeconds();
        let start_time = myDate.getTime();//自1970年...

        if(user=="1"&&numbers>0){
            await e.reply(`你已经在自习室了哦！好好学习吧！`)
        }
        else if(hours>=23){
            await e.reply(`喂喂 已经过了23点啦，别卷了快去睡觉！`)
        }
        else{
            await redis.set(`db:study:${e.user_id}`,1)
            await e.reply(`已进入自习室，现在是${hours}时${mins}分${secs}秒，当前人数：${parseInt(numbers)+1}`,false, { at: true })
            await redis.incr('db:numbers')
            //将现在的时间存入redis，维护user表
            await redis.set(`db:study:${e.user_id}:start_time`,start_time)
            let tmp = await redis.get('db:study:userlist')
            tmp =tmp + `${e.user_id}`+'|'
            await redis.set('db:study:userlist',tmp)
            //await redis.append('db:study:userlist',`${e.user_id}`+'|')
        }
        return true
    }
    async end_study (e) {
        let numbers = await redis.get('db:numbers')
        let user = await redis.get(`db:study:${e.user_id}`)
        if(user=="1"&&numbers>0){
            let myDate = new Date();
            let end_time = myDate.getTime();//自1970年...
            let start_time = await redis.get(`db:study:${e.user_id}:start_time`)
            let time = end_time - start_time//获取毫秒
            let T =moment(time).utcOffset(0).format('HH'+'小时'+'mm'+'分钟'+'ss'+'秒')//转下格式
            await e.reply(`已离开自习室，本次学习时长为${T}，当前人数：${parseInt(numbers)-1}`,false, { at: true })
            //同时将本次学习时间存入当日学习总时间中 //同时将本次学习时间作为分数，存入有序列表中，键就是学习时间
            let today = moment().format('MMDD')
            let oldtime = await redis.get(`db:study:${e.user_id}:${today}`)
            if(oldtime){//如果oldtime存在，要累加！
                // await redis.zincrby(`db:study:rank:${today}`,time,`${e.user_id}`)
                time = parseInt(oldtime) + time
            }
            //设置键的生存时间，这里设置到当天晚上的23:59
            let now = new Date();
            let endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 0);
            let timeDiff = endOfDay.getTime() - now.getTime();
            timeDiff = parseInt(timeDiff/1000); //转成秒
            //await e.reply("距离11.59有"+timeDiff+"秒")
            //设置键值
            await redis.set(`db:study:${e.user_id}:${today}`,time)
            await redis.expire(`db:study:${e.user_id}:${today}`,timeDiff)
            await redis.zAdd(`db:study:rank:${today}`,{score:parseInt(time/1000),value:`${e.user_id}`})
            await redis.expire(`db:study:rank:${today}`,timeDiff)
            //let test = redis.zcard(`db:study:rank:${today}`)
            //e.reply("排名人数"+test)
            //把用户的开始学习时间清空，学习状态重置
            await redis.decr('db:numbers')
            await redis.set(`db:study:${e.user_id}`,-1)
            await redis.set(`db:study:${e.user_id}:start_time`,0)
            let userlist = await redis.get('db:study:userlist')
            userlist = userlist.replace(`${e.user_id}`+'|','')
            redis.set('db:study:userlist',userlist)


        }else{
            await e.reply(`你不在自习室哦！要学习吗？`,false, { at: true })
        }
        return true
    }

    async get_numbers (e) {
        let numbers = await redis.get('db:numbers')
        await e.reply(`当前自习室人数：${numbers}`)
        return true
    }

    async get_time (e) {
        let today = moment().format('MMDD')
        let time = await redis.get(`db:study:${e.user_id}:${today}`)
        //await e.reply(`${time}!`)
        if(!time){
            await e.reply(`你今天还没有学习哦！`,false, { at: true })
        }else{
            time = parseInt(time)
            let T =moment(time).utcOffset(0).format('HH'+'小时'+'mm'+'分钟'+'ss'+'秒')//转下格式
            await e.reply(`你今天已经学习了${T}!`,false, { at: true })
        }
        return time
    }
    async test_redis(e){
        e.reply("test")
        let today = moment().format('MMDD')
        let item = await redis.zRange(`db:study:rank:${today}`, 0, -1 )
        e.reply(typeof item)
        let entries = [];
        items.forEach((item) => {
            entries.push(JSON.parse(item));
        });
        e.reply(entries)
    }
    
        //let result = await redis.zRange("myzset", 0, -1, "WITHSCORES") 
        //res = result.values()
        //e.reply(typeof res)
        //   //reply形式为[ 'one', '1', 'two', '2', 'three', '3' ]
        // let today = moment().format('YYYY-MM-DD HH:mm:ss')
        // connection.connect(); // 建立连接
        // for(let i=0;i<reply.length;i=i+2){
        //     sql = `insert into study (date,user_id,study_time) values ('${today}','${reply[i]}','${reply[i+1]/60}')`
        //     connection.query(sql, function (err, result) { // 执行SQL语句
        //         if (err) throw err;	
        //         });
        // } 
        // connection.end(); // 关闭连接
    

    async get_rank(e){
        let today = moment().format('MMDD')
        let count = await redis.zCard(`db:study:rank:${today}`) 
        redis.zRevRank(`db:study:rank:${today}`,`${e.user_id}`).then((res)=>{
            e.reply("你在总计"+count +"名用户中的排名为"+(res+1),false, { at: true })
        })

    }

}