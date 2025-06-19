import json
from get_all_threads import handle_get_all_threads
from get_thread_by_id import handle_get_thread_by_id

def lambda_handler(event, context):
    user_id = event['requestContext']['authorizer']['user_id']
    path_parameters = event.get('pathParameters', {})

    if path_parameters and 'thread_id' in path_parameters:
        thread_id = path_parameters['thread_id']
        return handle_get_thread_by_id(user_id, thread_id, event)
    else:
        return handle_get_all_threads(user_id, event)
