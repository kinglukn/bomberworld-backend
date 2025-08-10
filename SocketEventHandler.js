var Player = require("./Player");
var Room = require("./Room");

// These will be set by index.js
var rooms = global.rooms || [];
var players = global.players || [];

module.exports = function( io ){

	this.onClientConnect = function( client ){
		console.log('----------------------------------');
		console.log('user '+client.id+' connected!');

		client.player = new Player( client.id );
		players.push( client.player );

		// send new player his id
		client.emit("player connect", client.player )
	};

	this.onClientDisconnect = function(){
		console.log('----------------------------------');
		console.log('user '+this.id+' disconnected!');
		
		// Remove player from global players array
		var playerIndex = players.findIndex(p => p.id === this.id);
		if (playerIndex !== -1) {
			players.splice(playerIndex, 1);
		}

		// exclude player from the room if he's inside one
		if(this.room){
			var ri = rooms.indexOf(this.room);

			// reset room host if current player was him
			if( this.room.isHost( this.player ) ){
				this.player.is_active = false;

				this.room.rc_timestamp = Date.now();
				this.room.selectNewHost( io );
			}

			// remove all player's bombs from room map
			for( var l = 0; l < this.room.map.layers.length; l++ ){
				if(this.room.map.layers[l].name == "bombs"){
					for( var b = 0; b < this.room.map.layers[l].data.length; b++ ){
						if( this.room.map.layers[l].data[b] == this.player.serial + 1 )
							this.room.map.layers[l].data[b] = 0;
					}
					break;
				}
			}

			// notify all players left in room about player exiting
			this.room.emitBroadcast( io, 'player exit room', this.player, this.id);

			// unassign player from room
			this.room.excludePlayer( this.player );

			// remove room if no more players left
			if(this.room.isEmpty()){
				// swap last room in array with current one(prevent undefined elements in the array)
				rooms[ri] = rooms.splice(rooms.length - 1, 1, rooms[ri])[0];

				// remove empty room from the array
				rooms.pop();
			}
		}
	};

	// when current client asks for room to enter
	this.onRoomRequest = function(client_data){
		console.log("got 'room request' from " + this.player.id);

		var t_room = null;

		// search for an empty place among existing rooms
		for( var r = 0; r < rooms.length; r++ ){
			var room = rooms[r];

			if( room.isFull() ) continue;
			else{
				t_room = room;
				break;
			}
		}

		// if all rooms are full - create new one and add it to the rooms array
		if(t_room == null){
			t_room = new Room();
			rooms.push(t_room);
			console.log("Created new room: " + t_room.id);
		}
		
		this.player.name = client_data.name || ("Guest" + Math.floor(Math.random() * 9999));
		
		// associate current player with the room
		t_room.insertPlayer( this.player );

		// reset room host if room doesn't have one active
		if( !t_room.hasHost() )
			t_room.selectNewHost( io );

		// allow player-requester to the room
		this.emit('room found', t_room);

		// notify other players in the room about new player
		t_room.emitBroadcast( io, 'player join room', this.player, this.id);

		// associate socket with room for easy finding in the future
		this.room = t_room;
		
		console.log("Player " + this.player.name + " joined room " + t_room.id);
	};

	// when current client lost game focus
	this.onPlayerUnavailable = function(){
		console.log("Player "+this.id+" unavailable");
		if (!this.player) return;
		
		this.player.is_active = false;

		if( this.room && this.room.isHost( this.player ) ){
			this.room.rc_timestamp = Date.now();
			this.room.selectNewHost( io );
		}
	};

	// when current client gained game focus
	this.onPlayerAvailable = function(){
		console.log("Player "+this.id+" available");
		if (!this.player) return;
		
		this.player.is_active = true;
        
		if( this.room && !this.room.hasHost() )
			this.room.selectNewHost( io );

	};

	// when current client sends message to room chat
	this.onChatMessage = function( text ){
		console.log('got message from ' + this.id + ': ' + text);
		if (!this.player || !this.room) return;

		this.player.last_message = text;

		var message = {
			sender_id: this.id,
			body: text
		};

		// send message to other players in the room
		this.room.emitAll(io, 'chat message', message);
	};

	// when current client spawns in some place on the map
	this.onPlayerSpawn = function( data ){
		if (!this.player || !this.room) return;
		
        var tile_size = data.x;
        this.player.x = data.x = (this.room.map.spawn_order[this.room.next_spawn_index].col + 0.5) * tile_size;
        this.player.y = data.y = (this.room.map.spawn_order[this.room.next_spawn_index].row + 0.5) * tile_size;
        this.room.next_spawn_index == 7 ? this.room.next_spawn_index = 0 : this.room.next_spawn_index++;
		this.player.is_dead = false;
		this.player.is_invincible = true;
		this.player.i_timestamp = Date.now();
		this.player.nickname = data.nickname;

		data.timestamp = this.player.i_timestamp;

		this.room.emitAll(io, 'player spawn', data);
	};

	// when current client changes its position
	this.onPlayerMove = function( player_data ){
		if (!this.player || !this.room) return;
        if(this.player.is_dead) return;
		
		this.player.x = player_data[1];
		this.player.y = player_data[2];
		this.player.animation_key = player_data[3];

		this.room.emitBroadcast(io, "player move", player_data, this.id);
	};

	// when ANY player becomes dead
	this.onPlayerDeath = function( death_data ){
		if (!this.room) return;
		
		var victim = this.room.players[death_data.victim_serial];
		var killer = this.room.players[death_data.killer_serial];
		
		if (!victim || !killer) return;

        if( victim.is_invincible || victim.is_dead ) return;
        
		death_data.victim_serial == death_data.killer_serial && (victim.frags--);
		killer.frags = victim == killer ? killer.frags : killer.frags + 1;

		victim.is_dead = true;

		death_data.victim_id = victim.id;
		death_data.victim_frags = victim.frags;

		death_data.killer_id = killer.id;
		death_data.killer_frags = killer.frags;

		this.room.emitAll(io, "player death", death_data);
	};

	// when current client collected powerup
	this.onPlayerCollectPowerup = function( powerup_data ){
		if (!this.player || !this.room) return;
		
		// remove powerup from map
		for( var l = 0; l < this.room.map.layers.length; l++ ){
			if(this.room.map.layers[l].name == "powerups"){
				var pi = powerup_data.row * this.room.map.width + powerup_data.col;
				this.room.map.layers[l].data[pi] = 0;
				break;
			}
		}

		powerup_data.timestamp = Date.now();
		powerup_data.c_serial = this.player.serial;

		// save invicibility timestamp
		if( powerup_data.type == "protection" ){
			this.player.is_invincible = true;
			this.player.i_timestamp = powerup_data.timestamp;
		};

		// notify all that powerup was collected
		this.room.emitAll(io, 'player collect powerup', powerup_data);
	};

	// when ANY player loses invincibility
	this.onPlayerLostInvicibility = function( player_data ){
		if (!this.room) return;
		
		var player = this.room.players[player_data.serial];
		if (player) {
			player.is_invincible = false;
		}

		// notify all that player lost invincibility
		this.room.emitAll(io, 'player lost invincibility', player_data);
	};

	// when current client plants bomb
	this.onPlayerPlantBomb = function( bomb_data ){
		if (!this.room) return;
		
		var owner = this.room.players[bomb_data.owner_serial];
		if (!owner) return;

		// add timestamp to bomb
		bomb_data.timestamp = Date.now();
		console.log('Bomb planted by ' + owner.id + ' at ['+bomb_data.col+';'+bomb_data.row+'] ');

		// set owner index in bombs layer
		for( var l = 0; l < this.room.map.layers.length; l++ ){
			if(this.room.map.layers[l].name == "bombs"){
				var bomb_index = bomb_data.row * this.room.map.width + bomb_data.col;
				if(this.room.map.layers[l].data[bomb_index]) return;
				this.room.map.layers[l].data[bomb_index] = bomb_data.owner_serial + 1;
				break;
			}
		}

		// notify all about new bomb on the map
		this.room.emitAll(io, 'player plant bomb', bomb_data);
	};

	this.onBombExplode = function( bomb_data ){
		if (!this.room) return;
		
        console.log("Bomb exploded at positions:", bomb_data.e_indexes);
		
		var objects_layer, bombs_layer;
		for(var l = 0; l < this.room.map.layers.length; l++){
			switch(this.room.map.layers[l].name){
				case "objects":
					objects_layer = this.room.map.layers[l];
					break;
				case "bombs":
					bombs_layer = this.room.map.layers[l];
					break;
			}
		}

		if (objects_layer && bombs_layer) {
			for( var i = 0; i < bomb_data.e_indexes.length; i++ ){
				var col = bomb_data.e_indexes[i][0];
				var row = bomb_data.e_indexes[i][1];

				var oi = row * this.room.map.width + col;
				bombs_layer.data[oi] = 0;
				objects_layer.data[oi] = 0;
			}
		}

		bomb_data.timestamp = Date.now();

		// notify all that bomb had exploded
		this.room.emitAll(io, 'bomb explode', bomb_data);
	};

	// when powerup on map starts blinking
	this.onPowerupBlink = function( powerup_data ){
		if (!this.room) return;
		
		// notify all that powerup started blinking
		this.room.emitAll(io, 'powerup blink', powerup_data);
	};

	this.onPowerupDisappear = function( powerup_data ){
		if (!this.room) return;
		
		// remove powerup from room map
		for(var l = 0; l < this.room.map.layers.length; l++){
			if(this.room.map.layers[l].name != "powerups") continue;

			var oi = powerup_data.row * this.room.map.width + powerup_data.col;
			this.room.map.layers[l].data[oi] = 0;
		}

		// notify all that powerup had disappeared
		this.room.emitAll(io, 'powerup disappear', powerup_data);
	};

	this.onMapReset = function(){
		if (!this.room) return;
		
		this.room.resetMap();
		this.room.emitAll(io, 'map reset', this.room);
	};

};
